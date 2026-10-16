#!/usr/bin/env python3
"""Local task replay gateway. Public builds still work as a static website.

Run with --runtime /private/path/preview-servers.json. Only the two explicitly
configured Medium services are reachable; never mount private artifacts here.
Candidate frames have opaque origins, separate server-side cookie jars, and a
restricted CSP. This is a local development server, not a public hosting service.
"""
import argparse
import html
import http.cookiejar
import http.server
import ipaddress
import json
from pathlib import Path
import re
import secrets
import threading
import time
import mimetypes
import gzip
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]
RUN_ID = 'xlsx-3fe67e9178baf494'


def route(url, prefix):
    if url.startswith('/') and not url.startswith('//') and not url.startswith(prefix):
        return prefix + url.lstrip('/')
    return url


def javascript(source):
    # Navigation adaptation only. The archived source on disk is never changed.
    source = re.sub(r'(?<![\w.])location\.href\s*=\s*([^;\n]+)',
                    r'location.href = window.__wbRoute(\1)', source)
    source = source.replace('location.pathname', 'window.__wbPath()')
    source = source.replace('location.origin', 'window.__wbOrigin')
    return source


def stylesheet(source, prefix):
    return re.sub(r'url\((\s*[\"\']?)(/(?!/)[^\)\"\']*)',
                  lambda m: 'url(' + m[1] + route(m[2], prefix), source)


class ReplayHTML(HTMLParser):
    def __init__(self, prefix):
        super().__init__(convert_charrefs=False)
        self.prefix, self.parts, self.inside = prefix, [], ''

    def handle_starttag(self, tag, attrs):
        rewritten = []
        for key, value in attrs:
            if value is not None:
                if key in ('href', 'src', 'action', 'formaction', 'poster'):
                    value = route(value, self.prefix)
                elif key == 'srcset':
                    value = ', '.join(route(part.strip(), self.prefix) for part in value.split(','))
                elif key.startswith('on'):
                    value = javascript(value)
                elif key == 'style':
                    value = stylesheet(value, self.prefix)
                elif key == 'target':
                    value = '_self'
            rewritten.append(key if value is None else f'{key}="{html.escape(value, quote=True)}"')
        self.parts.append('<' + tag + (' ' if rewritten else '') + ' '.join(rewritten) + '>')
        if tag in ('script', 'style'):
            self.inside = tag

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        self.parts.append(f'</{tag}>')
        if tag == self.inside:
            self.inside = ''

    def handle_data(self, data):
        self.parts.append(javascript(data) if self.inside == 'script' else
                          stylesheet(data, self.prefix) if self.inside == 'style' else data)

    def handle_entityref(self, name):
        self.parts.append('&' + name + ';')

    def handle_charref(self, name):
        self.parts.append('&#' + name + ';')

    def handle_decl(self, decl):
        self.parts.append('<!' + decl + '>')

    def handle_comment(self, data):
        self.parts.append('<!--' + data + '-->')


def shim(prefix, origin, role, site_origin=None, status=200):
    settings = json.dumps({'prefix': prefix, 'origin': origin, 'site': site_origin or origin, 'role': role, 'status': status})
    return '''<script>(()=>{const s=SETTINGS;
window.__wbOrigin=s.site;
window.__wbPath=()=>location.pathname.slice(s.prefix.length-1)||'/';
window.__wbRoute=value=>{try{const u=new URL(String(value),location.href);
 if(u.origin!==s.site)return s.prefix;
 if(!u.pathname.startsWith(s.prefix))u.pathname=s.prefix+u.pathname.replace(/^\\//,'');
 return u.href;}catch(_){return s.prefix;}};
const originalFetch=window.fetch;
window.fetch=(input,options)=>originalFetch(typeof input==='string'||input instanceof URL?
 window.__wbRoute(input):new Request(window.__wbRoute(input.url),input),options);
const open=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(method,url,...rest){return open.call(this,method,window.__wbRoute(url),...rest);};
document.addEventListener('click',event=>{const a=event.target.closest?.('a[href]');
 if(a){a.href=window.__wbRoute(a.getAttribute('href'));a.target='_self';}},true);
document.addEventListener('submit',event=>{event.target.action=window.__wbRoute(event.target.action);event.target.target='_self';},true);
const send=data=>{if(parent!==window)parent.postMessage({...data,role:s.role},s.origin);};
const report=()=>send({type:'websitebench-live-route',path:window.__wbPath()+location.search,status:s.status});
for(const method of ['pushState','replaceState']){const original=history[method];history[method]=function(state,title,url){const result=original.call(this,state,title,url==null?url:window.__wbRoute(url));report();return result;};}
let suppress=0,pending=false,lastScroller;
const root=()=>document.scrollingElement||document.documentElement;
const scrollState=()=>{const el=lastScroller||root(),r=el===root()?{left:0,top:0,width:innerWidth,height:innerHeight}:el.getBoundingClientRect();return {x:el.scrollLeft/Math.max(1,el.scrollWidth-el.clientWidth),y:el.scrollTop/Math.max(1,el.scrollHeight-el.clientHeight),pointX:Math.max(0,Math.min(1,(r.left+r.width/2)/innerWidth)),pointY:Math.max(0,Math.min(1,(r.top+r.height/2)/innerHeight)),nested:el!==root()};};
document.addEventListener('scroll',event=>{if(performance.now()<suppress)return;lastScroller=event.target===document?root():event.target;if(pending)return;pending=true;setTimeout(()=>{pending=false;send({type:'websitebench-live-scroll',...scrollState()});},70);},{capture:true,passive:true});
const destination=d=>{if(!d.nested&&(root().scrollHeight>innerHeight+2||root().scrollWidth>innerWidth+2))return root();let el=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,(Number.isFinite(d.pointX)?d.pointX:.5)*innerWidth)),Math.max(0,Math.min(innerHeight-1,(Number.isFinite(d.pointY)?d.pointY:.5)*innerHeight)));while(el&&el!==document.body){const style=getComputedStyle(el);if(/auto|scroll/.test(style.overflow+style.overflowY+style.overflowX)&&(el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2))return el;el=el.parentElement;}return root();};
addEventListener('message',event=>{if(event.source!==parent||event.origin!==s.origin)return;const d=event.data;
 if(d?.type==='websitebench-set-scroll'&&Number.isFinite(d.y)&&Number.isFinite(d.x)){suppress=performance.now()+180;const el=destination(d);el.scrollTo({left:Math.max(0,Math.min(1,d.x))*Math.max(0,el.scrollWidth-el.clientWidth),top:Math.max(0,Math.min(1,d.y))*Math.max(0,el.scrollHeight-el.clientHeight),behavior:'instant'});}
 if(d?.type==='websitebench-navigate'&&typeof d.path==='string'&&/^\\/(?!\\/)/.test(d.path)&&!d.path.includes('\\\\')&&d.path.length<2000)location.href=window.__wbRoute(d.path);
});
addEventListener('DOMContentLoaded',report);addEventListener('popstate',report);addEventListener('hashchange',report);
})();</script>'''.replace('SETTINGS', settings)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class LocalReplayCookies(http.cookiejar.DefaultCookiePolicy):
    def __init__(self, upstream):
        super().__init__()
        self.upstream = upstream + '/'

    def return_ok_secure(self, cookie, request):
        # The reference declares Secure cookies, while the isolated container
        # hop uses HTTP. Retain their other checks; permit this one fixed local
        # hop only. Cookies are never returned to the preview browser.
        return (request.full_url.startswith(self.upstream)
                or super().return_ok_secure(cookie, request))


class Gateway(http.server.SimpleHTTPRequestHandler):
    sessions = {}
    session_lock = threading.Lock()
    runtime = {}
    trajectories = []
    trace_tokens = {}
    store = None
    replay = None
    replay_links = {}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *_):
        pass  # Do not log session tokens or submitted form values.

    def reply(self, code, body, content_type='application/json', live=None, extra=None):
        extra = dict(extra or {})
        if (len(body) > 2048 and 'gzip' in self.headers.get('Accept-Encoding', '')
                and ('json' in content_type or content_type.startswith('text/') or 'javascript' in content_type)):
            body = gzip.compress(body, compresslevel=3)
            extra.update({'Content-Encoding': 'gzip', 'Vary': 'Accept-Encoding'})
        self.send_response(code)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', extra.pop('Cache-Control', 'no-store'))
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if live:
            origin = live['origin']
            site = live.get('site_origin', origin)
            if not live.get('native'):
                self.send_header('Access-Control-Allow-Origin', 'null')
            self.send_header('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With')
            self.send_header('Content-Security-Policy',
                f"default-src 'none'; script-src {site} 'unsafe-inline'" + (" 'unsafe-eval'; " if live.get('native') else '; ') +
                f"style-src {site} 'unsafe-inline'; img-src {site} data: blob:; "
                f"font-src {site} data:; connect-src {site}; worker-src {site} blob:; "
                f"form-action {site}; base-uri {site}; frame-src {site}; frame-ancestors {origin} {site}; "
                "sandbox allow-scripts allow-forms" + (' allow-same-origin' if live.get('native') else ''))
        for key, value in extra.items():
            self.send_header(key, value)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def local_origin(self):
        origin = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('origin', [''])[0]
        parsed = urllib.parse.urlsplit(origin)
        if (self.headers.get('Origin') == 'null' or self.headers.get('Sec-Fetch-Site') == 'cross-site'
                or (self.headers.get('Origin') and self.headers.get('Origin') != origin)
                or parsed.scheme not in ('http', 'https')
                or parsed.hostname not in ('localhost', '127.0.0.1', '::1')
                or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment
                or origin != f'{parsed.scheme}://{parsed.netloc}'):
            return None
        return origin

    def task_api(self):
        if self.headers.get('Origin') == 'null' or not self.store:
            return self.reply(404, b'{"error":"Task service unavailable"}')
        parts = urllib.parse.urlsplit(self.path)
        params = urllib.parse.parse_qs(parts.query)
        operation = parts.path.removeprefix('/_preview_runtime/')
        if operation.startswith('task-data/'):
            match = re.fullmatch(r'task-data/([a-f0-9]{24})/([\w.-]+)', operation)
            try:
                path = self.store.file(match[1], match[2]) if match else None
                if not path:
                    raise FileNotFoundError()
                kind = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
                return self.reply(200, path.read_bytes(), kind + ('; charset=utf-8' if kind.startswith('text/') else ''),
                                  extra={'Cache-Control': 'private, max-age=86400, immutable'})
            except FileNotFoundError:
                return self.reply(404, b'{"error":"Recorded object unavailable"}')
        origin = self.local_origin()
        if not origin:
            return self.reply(403, b'{"error":"Local task origin required"}')
        uid = params.get('id', [''])[0]
        if uid not in self.store.records and not (operation == 'task-replay' and self.replay and self.replay.record(uid)):
            return self.reply(404, b'{"error":"Unknown recorded context"}')
        if operation == 'task-trace':
            result = self.store.prepare(uid)
        elif operation == 'task-search':
            try:
                result = self.store.search(uid, params.get('agent', ['main'])[0],
                                           params.get('q', [''])[0], params.get('role', ['all'])[0])
            except (FileNotFoundError, StopIteration):
                return self.reply(404, b'{"error":"Trajectory index unavailable"}')
        elif operation == 'task-replay' and self.replay:
            client = params.get('client', [''])[0]
            registry_key = origin + ':' + client + ':' + uid
            if params.get('reset') == ['1']:
                with self.session_lock:
                    for token in self.replay_links.pop(registry_key, {}).values():
                        self.sessions.pop(token, None)
            result = self.replay.prepare(uid, client, params.get('reset') == ['1'])
            if result.get('status') in ('ready', 'partial'):
                registry_key = origin + ':' + client + ':' + uid
                with self.session_lock:
                    for token, session in list(self.sessions.items()):
                        if session['expires'] <= time.time() or (session.get('instance_key') and session['instance_key'] not in self.replay.instances):
                            self.sessions.pop(token, None)
                    cached = self.replay_links.get(registry_key)
                    if (not cached or set(cached) != set(result['services']) or any(
                        self.sessions.get(token, {}).get('instance_generation') != result['services'][role]['generation']
                        for role, token in cached.items())):
                        for token in (cached or {}).values():
                            self.sessions.pop(token, None)
                        while len(self.sessions) > 124:
                            self.sessions.pop(min(self.sessions, key=lambda token: self.sessions[token]['expires']))
                        type(self).replay_links = {key: value for key, value in self.replay_links.items()
                                                   if all(token in self.sessions for token in value.values())}
                        cached = {}
                        for role, instance in result['services'].items():
                            token = secrets.token_hex(24)
                            parent_url = urllib.parse.urlsplit(origin)
                            site_origin = f'{parent_url.scheme}://{token}.localhost' + (f':{parent_url.port}' if parent_url.port else '')
                            self.sessions[token] = {'origin': origin, 'role': role, 'upstream': instance['url'],
                                'site_origin': site_origin, 'native': True,
                                'instance_key': instance['key'], 'expires': time.time() + 7200,
                                'instance_generation': instance['generation'],
                                'lock': threading.Lock(), 'opener': urllib.request.build_opener(
                                    urllib.request.ProxyHandler({}), NoRedirect(),
                                    urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar(LocalReplayCookies(instance['url']))))}
                            cached[role] = token
                        self.replay_links[registry_key] = cached
                    result['services'] = {role: self.sessions[token]['site_origin'] + '/' for role, token in cached.items()}
                    result['fallback_services'] = {role: '/__live/' + token + '/' for role, token in cached.items()}
        else:
            return self.reply(404, b'{"error":"Task operation unavailable"}')
        return self.reply(200, json.dumps(result).encode())

    def config(self):
        if not self.runtime:
            return self.reply(404, b'{"error":"Legacy preview not configured"}')
        origin = self.local_origin()
        if not origin:
            return self.reply(403, b'{"error":"Local preview origin required"}')
        result = {'task': 'medium', 'model': 'qwen', 'run_id': RUN_ID, 'services': {}}
        with self.session_lock:
            now = time.time()
            self.sessions = {key: value for key, value in self.sessions.items() if value['expires'] > now}
            # The registry lives on the class, shared by all request handlers.
            type(self).sessions = self.sessions
            if len(self.sessions) >= 128:
                return self.reply(503, b'{"error":"Too many previews"}')
            for role in ('reference', 'qwen'):
                token = secrets.token_urlsafe(24)
                self.sessions[token] = {'origin': origin, 'role': role, 'upstream': self.runtime[role]['url'],
                    'expires': now + 7200, 'lock': threading.Lock(),
                    'opener': urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect(),
                        urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar(
                            LocalReplayCookies(self.runtime[role]['url']))))}
                result['services'][role] = f'/__live/{token}/'
        self.reply(200, json.dumps(result).encode())

    def trace_index(self):
        if not self.local_origin():
            return self.reply(403, b'{"error":"Local preview origin required"}')
        params = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        task, model = params.get('task', [''])[0], params.get('model', [''])[0]
        result = []
        with self.session_lock:
            now = time.time()
            type(self).trace_tokens = {key: value for key, value in self.trace_tokens.items()
                                      if value['expires'] > now}
            matches = [record for record in self.trajectories
                       if record['task'] == task and record['model'] == model]
            if len(self.trace_tokens) + len(matches) > 256:
                return self.reply(503, b'{"error":"Too many trajectory previews"}')
            for record in matches:
                token = secrets.token_urlsafe(24)
                self.trace_tokens[token] = {'path': record['file'], 'expires': now + 7200}
                public = {key: record[key] for key in ('task', 'model', 'run_id', 'label', 'context')
                          if key in record}
                public['url'] = f'/_preview_runtime/trace/{token}.json'
                result.append(public)
        self.reply(200, json.dumps({'runs': result}).encode())

    def trace_file(self):
        # Opaque candidate frames must never enumerate or read host trajectories.
        if self.headers.get('Origin') == 'null':
            return self.reply(403, b'{"error":"Trajectory access denied"}')
        match = re.fullmatch(r'/_preview_runtime/trace/([\w-]+)\.json',
                             urllib.parse.urlsplit(self.path).path)
        token = self.trace_tokens.get(match[1]) if match else None
        if not token or token['expires'] < time.time():
            return self.reply(410, b'{"error":"Trajectory link expired. Reload the task page."}')
        try:
            path = token['path']
            if path.stat().st_size > 64 * 1024 * 1024:
                return self.reply(413, b'{"error":"Trajectory exceeds preview limit"}')
            self.reply(200, path.read_bytes())
        except OSError:
            self.reply(404, b'{"error":"Trajectory unavailable"}')

    def proxy(self):
        parts = urllib.parse.urlsplit(self.path)
        native = self.native_token()
        match = re.fullmatch(r'/__live/([\w-]+)(/.*)', parts.path)
        token = native or (match[1] if match else None)
        original = self.sessions.get(token)
        session = dict(original) if original else None
        if session and not native:
            session['native'] = False
            session.pop('site_origin', None)
        if not session or session['expires'] < time.time():
            return self.reply(410, b'Preview expired. Reload the task browser.', 'text/plain')
        if session.get('instance_key') and not self.replay.touch(session['instance_key']):
            return self.reply(410, b'Website paused after inactivity. Restart it from the task page.', 'text/plain', session)
        if self.command == 'OPTIONS':
            return self.reply(204, b'', live=session)
        path = parts.path if native else match[2]
        if path.startswith('//') or '\\' in path or any(p in ('.', '..') for p in urllib.parse.unquote(path).split('/')):
            return self.reply(400, b'Invalid preview path.', 'text/plain', session)
        prefix = '/' if native else f'/__live/{token}/'
        target = session['upstream'] + path + ('?' + parts.query if parts.query else '')
        try:
            size = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            return self.reply(400, b'Invalid form size.', 'text/plain', session)
        if size < 0 or size > 2_000_000:
            return self.reply(413, b'Form too large.', 'text/plain', session)
        body = self.rfile.read(size) if size else None
        headers = {'Accept-Encoding': 'identity'}
        if native:
            headers['Host'] = urllib.parse.urlsplit(session['site_origin']).netloc
            if self.headers.get('Origin') == session['site_origin']:
                headers['Origin'] = session['site_origin']
        for name in ('Content-Type', 'Accept', 'X-Requested-With'):
            if self.headers.get(name):
                headers[name] = self.headers[name]
        request = urllib.request.Request(target, body, headers, method=self.command)
        try:
            with session['lock']:
                try:
                    response = session['opener'].open(request, timeout=20)
                except urllib.error.HTTPError as error:
                    response = error
                with response:
                    data, code, response_headers = response.read(64 * 1024 * 1024 + 1), response.code, response.headers
                    if len(data) > 64 * 1024 * 1024:
                        return self.reply(413, b'This replay resource exceeds the size limit.', 'text/plain', session)
            content_type = response_headers.get('Content-Type', 'application/octet-stream')
            if code >= 500 and self.headers.get('Sec-Fetch-Dest') in ('iframe', 'document') and 'html' not in content_type:
                data = ('<!doctype html><html><head><title>Website response</title></head><body><pre>'
                        + html.escape(data.decode('utf-8', errors='replace')) + '</pre></body></html>').encode()
                content_type = 'text/html; charset=utf-8'
            extra = {}
            if self.command == 'GET' and code == 200 and re.search(r'\.(?:css|js|png|jpe?g|webp|gif|woff2?|ttf|ico)$', path, re.I):
                extra['Cache-Control'] = 'private, max-age=3600'
            if response_headers.get('Location'):
                destination = urllib.parse.urlsplit(urllib.parse.urljoin(target, response_headers['Location']))
                upstream = urllib.parse.urlsplit(session['upstream'])
                if destination.netloc not in (upstream.netloc, urllib.parse.urlsplit(session.get('site_origin', '')).netloc):
                    return self.reply(502, b'External redirect unavailable in local replay.', 'text/plain', session)
                extra['Location'] = prefix + destination.path.lstrip('/') + ('?' + destination.query if destination.query else '')
            if self.command != 'HEAD' and ('text/html' in content_type or 'javascript' in content_type or 'text/css' in content_type):
                text = data.decode('utf-8')
                if 'text/html' in content_type:
                    if not native:
                        parser = ReplayHTML(prefix)
                        parser.feed(text)
                        text = ''.join(parser.parts)
                    injection = ('' if native else '<base href="' + prefix + '">') + shim(prefix, session['origin'], session['role'], session.get('site_origin'), code)
                    if re.search(r'<head\b', text, re.I):
                        text = re.sub(r'(<head\b[^>]*>)', lambda m: m[1] + injection, text, count=1, flags=re.I)
                    else:
                        text = injection + text
                elif 'javascript' in content_type:
                    if not native:
                        text = javascript(text)
                else:
                    if not native:
                        text = stylesheet(text, prefix)
                data = text.encode('utf-8')
            self.reply(code, data, content_type, session, extra)
        except (OSError, ValueError, urllib.error.URLError):
            self.reply(502, b'Local task service unavailable. Switch to Screenshot.', 'text/plain', session)

    def native_token(self):
        try:
            host = urllib.parse.urlsplit('http://' + self.headers.get('Host', '')).hostname or ''
        except ValueError:
            return None
        if host.endswith('.localhost'):
            return host.removesuffix('.localhost')
        return None

    def do_GET(self):
        if self.native_token():
            return self.proxy()
        if self.path.startswith(('/_preview_runtime/task-',)):
            return self.task_api()
        if self.path.startswith('/_preview_runtime/trajectories?'):
            return self.trace_index()
        if self.path.startswith('/_preview_runtime/trace/'):
            return self.trace_file()
        if self.path.startswith('/_preview_runtime/config?'):
            return self.config()
        if self.path.startswith('/__live/'):
            return self.proxy()
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        resolved = Path(self.translate_path(self.path)).resolve()
        if any(part.startswith('.') for part in path.split('/') if part) or not resolved.is_relative_to(ROOT):
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if self.native_token():
            return self.proxy()
        if self.path.startswith('/__live/'):
            return self.proxy()
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        if any(part.startswith('.') for part in path.split('/') if part) or not Path(self.translate_path(self.path)).resolve().is_relative_to(ROOT):
            return self.send_error(404)
        super().do_HEAD()

    def mutate(self):
        if self.native_token():
            return self.proxy()
        if self.path.startswith('/__live/'):
            return self.proxy()
        self.send_error(405)

    do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = mutate


if __name__ == '__main__':
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument('--runtime', type=Path)
    args.add_argument('--port', type=int, default=8000)
    args.add_argument('--trajectories', type=Path,
                      help='Optional private manifest for explicitly connected ATIF files')
    args.add_argument('--task-index', type=Path, help='Verified private task/material bindings')
    args.add_argument('--task-cache', type=Path, help='Private derived trace and replay cache')
    args.add_argument('--references', type=Path, help='Reference websites directory; enables demand-loaded Docker replays')
    args.add_argument('--runtime-namespace', default='task', help='Isolate containers from another local preview gateway')
    options = args.parse_args()
    Gateway.runtime = json.loads(options.runtime.read_text()) if options.runtime else {}
    for role in Gateway.runtime:
        service = urllib.parse.urlsplit(Gateway.runtime[role]['url'])
        if service.scheme != 'http' or not ipaddress.ip_address(service.hostname).is_private or service.path or service.username:
            raise SystemExit('Runtime services must be explicit private HTTP addresses.')
    if options.task_index:
        from task_store import TaskStore
        Gateway.store = TaskStore(options.task_index, options.task_cache or options.task_index.parent / 'cache')
        if options.references:
            from replay_runtime import ReplayRuntime
            Gateway.replay = ReplayRuntime(Gateway.store, options.references, namespace=options.runtime_namespace)
    if options.trajectories:
        manifest = options.trajectories.resolve()
        results = json.loads((ROOT / 'data/task-results.json').read_text())
        allowed = {(task['id'], model, trial['id']) for task in results['tasks']
                   for model, trials in task['results'].items() for trial in trials}
        seen = set()
        for record in json.loads(manifest.read_text())['runs']:
            identity = (record['task'], record['model'], record['run_id'])
            path = (manifest.parent / record['file']).resolve()
            if (identity not in allowed or identity in seen or not path.is_relative_to(manifest.parent)
                    or path.is_relative_to(ROOT) or path.suffix != '.json' or not path.is_file()
                    or path.stat().st_size > 64 * 1024 * 1024
                    or not isinstance(record.get('label'), str)):
                raise SystemExit('Invalid private trajectory binding.')
            document = json.loads(path.read_text())
            if not re.fullmatch(r'ATIF-v1\.[0-8]', document.get('schema_version', '')) or not isinstance(document.get('steps'), list):
                raise SystemExit('Private trajectory must be an ATIF document.')
            if record.get('sha256'):
                import hashlib
                if hashlib.sha256(path.read_bytes()).hexdigest() != record['sha256']:
                    raise SystemExit('Trajectory source hash mismatch.')
            seen.add(identity)
            Gateway.trajectories.append({**record, 'file': path})
    print(f'Local interactive preview: http://localhost:{options.port}/tasks.html', flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', options.port), Gateway).serve_forever()
