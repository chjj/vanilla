// Vanilla - a sinatra-like framework for node.js
// Copyright (c) 2011, Christopher Jeffrey (MIT Licensed)

var http = require('http'),
    fs = require('fs'),
    url = require('url'), 
    qs = require('querystring'),
    StringDecoder = require('string_decoder').StringDecoder;

// dev mode disables caching
var DEVELOPMENT = (
  process.argv.indexOf('-dev') !== -1
  || process.env.NODE_ENV === 'development'
) && 'development';

var TEST = (
  process.argv.indexOf('-test') !== -1 
  || process.env.NODE_ENV === 'test'
) && 'test';

if (DEVELOPMENT) {
  console.log('\033[33m-- Starting in development mode. --\033[39m');
}

var Request = http.IncomingMessage,
    Response = http.ServerResponse;

var _s = [].slice;

// ========== APPLICATION ========== //
var Application = function() {
  var args = arguments[0];
  if (!Array.isArray(args)) { 
    args = _s.call(arguments); 
  }
  if (!(this instanceof Application)) {
    return new Application(args);
  }
  if (typeof args[0] === 'object') {
    this.https = args.shift();
  }
  this.cfg = {
    root: process.cwd(),
    views: process.cwd() + '/views',
    charset: 'utf-8',
    limit: 30 * 1024,
    lang: 'en'
  };
  this.env = DEVELOPMENT || TEST || 'production';
  this._listener = listener(this);
  this._router = router(this);
  if (args.length > 0) {
    this.route.apply(this, args);
  }
  this.server = this.https 
    ? require('https').createServer(this.https, this._listener)
    : http.createServer(this._listener);
};

module.exports = exports = Application;
exports.Application = Application;

Application.listen = function() {
  return Application.prototype.listen.apply(new Application(), arguments);
};

Application.prototype.configure = 
Application.prototype.config = function(env, func) {
  if (!func || env === this.env) (func || env)();
};

// configuration - also sets internal middleware
Application.prototype.set = function(name, val) {
  if (arguments.length === 1) {
    return this.cfg[name];
  }
  switch (name) {
    case 'public':
    case 'static':
      var func = function(req, res) {
        res.send(val + req.pathname);
      };
      fs.readdirSync(val).forEach(function(file) {
        this.get('/' + file + '*', func);
      }, this);
      break;
    case 'sessions':
      this.route(sessions(val));
      break;
    default:
      this.cfg[name] = val;
  }
  return this;
};

// start a server for the app.
// make sure the main file executes first
// by pushing everything onto the nextTick queue.
Application.prototype.listen = function(port, host) {
  var app = this;
  process.nextTick(function() { 
    // if the app is mounted or vhosted,
    // it inherits its parent's server
    if (app._parent) {
      app.port = app._parent.port; 
      app.host = app._parent.host; 
      app.server = app._parent.server; 
      return; 
    }
    app.port = port || 8080;
    app.host = host || '127.0.0.1';
    app.server.listen(app.port, app.host, function() {
      console.log('\033[33mVanilla\033[39m - '
        + 'Listening on port: ' + app.port + '.'
      );
    });
  });
  return app;
};

// mount an app, will route to the apps router
// mounted apps shouldn't have a listener or internal stack
Application.prototype.mount = function(route, app) {
  app._parent = this;
  app._route = route = '/' + route.replace(/^\/|\/$/g, '');
  var len = route.length, slots = route.split('/').length - 1;
  this.route(route + '*', function(req, res) {
    //if (req.pathname.indexOf(route) === 0)
    // maybe check for favicon here?
    req.app = res.app = app;
    req._url = req.url;
    req.url = req.url.replace(route, ''); 
    
    // fix for absolute urls and 
    // relative urls that become ''
    // not perfect for relative protocol urls
    if (req.url.charAt(0) !== '/') req.url += '/';
    
    req.pathname = req.pathname.slice(len) || '/';
    req.path = req.path.slice(slots); 
    // pass to the child app's router
    app._router(req, res);
  });
};

// vhosting, examine the host header
Application.prototype.vhost = function(host, app) {
  app._parent = this;
  this.route(function(req, res) {
    // could do some actual pattern matching here
    // but it doesnt seem terribly necessary
    if (req.host.indexOf(host) === 0) {
      req.app = res.app = app;
      // hacky way to update the app's host
      if (app._host == null) {
        app._host = app.host;
        app.host = req.host;
      }
      app._router(req, res);
    } else {
      res.pass();
    }
  });
};

Application.prototype.__defineGetter__('url', function() {
  return ( // cant cache this
    'http' + (this.https ? 's' : '') + '://' + this.host
    + (this.port != 80 ? ':' + this.port : '')
  );
});

// ========== RESPONSE ========== //
Response.prototype.serve = function(data, func) {
  var res = this, req = this.req, app = this.app;
  if (res.finished) return;
  
  // no content
  if (!data) { 
    return res.error(204); 
  }
  
  if (!res.statusCode) res.statusCode = 200;
  
  var buff = Buffer.isBuffer(data);
  if (typeof data === 'object' && !buff) {
    data = JSON.stringify(data);
    if (req.query.callback) {
      res.type('application/javscript');
      data = req.query.callback + '(' + data + ');';
    } else {
      res.type('application/json');
    }
  }
  
  // basic headers
  if (!res.getHeader('Content-Type')) {
    res.type('text/html');
  }
  res.setHeader('Content-Length', buff ? data.length : Buffer.byteLength(data));
  res.setHeader('Content-Language', res.app.cfg.lang);
  
  // make sure to minimize the IE problem, force chrome frame
  res.setHeader('X-UA-Compatible', 'IE=Edge,chrome=1');
  
  var ret = res.end(req.method !== 'HEAD' && data);
  
  // check the return value to 
  // execute the callback
  if (func) {
    if (ret === false) {
      res.socket.once('drain', func);
    } else {
      func();
    }
  }
  
  if (DEVELOPMENT) console.log(
    'Response Time:', 
    (Date.now() - res.start) 
    + 'ms' + ' - ' + req.method 
    + ' ' + req.url
  );
};

// attach a file with content-disposition
Response.prototype.attach = function(file, func) {
  res.setHeader('Content-Disposition', 'attachment' 
    + (file ? '; filename="' + file + '"' : '')
  );
  if (file) {
    this.type(file);
    this.send(file, func);
  }
};

// serve a static file
Response.prototype.sendfile = 
Response.prototype.send = function(file, func) {
  var res = this, req = this.req, app = this.app; 
  if (!file) {
    return res.error(500);
  }
  if (file.indexOf('..') !== -1) {
    return res.error(403);
  }
  if (file.charAt(0) !== '/') {
    file = app.cfg.root + '/' + file;
  }
  fs.stat(file, function(err, stat) {
    if (err && err.code === 'ENOENT') {
      return res.error(404); 
    }
    
    if (err || !stat || !stat.isFile()) {
      return res.error(500); 
    }
    
    var entity = stat.mtime.getTime()
      .toString(16) + stat.size;
    if (res.etag(entity)) return;
    
    res.statusCode = 200;
    if (!res.getHeader('Content-Type')) {
      res.type(file);
    }
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');
    
    if (req.headers.range) {
      var range = (function() {
        var r = req.headers.range
          .replace(/\s/g, '')
          .match(/^bytes=(\d*)-(\d*)$/i);
        if (!r) return;
        r[1] = r[1] || 0;
        r[2] = r[2] || stat.size;
        if (r[1] < r[2] && r[2] < stat.size) {
          return { start: +r[1], end: +r[2] };
        }
      })();
      res.statusCode = range ? 206 : 416;
      res.setHeader('Content-Range', 
        'bytes ' + 
        (range ? range.start + '-' + range.end : '*') 
        + '/' + stat.size
      );
    }
    
    if (req.method === 'HEAD') {
      return res.end();
    }
    
    var stream = fs.createReadStream(file, range);
    var end = function(err) {
      if (err) stream.destroy();
      res.socket.removeListener('error', end);
      res.end();
      if (func) func.apply(res, arguments);
    };
    
    stream
      .on('error', end)
      .on('end', end)
      .pipe(res, { end: false });
    res.socket.on('error', end);
  });
};

// caching functions - will return true
// if a stale response was sent as a result
Response.prototype.modified = function(base) {
  var req = this.req;
  if (DEVELOPMENT) return;
  if (!req.modified && req.headers['if-modified-since']) {
    var modified = new Date(req.headers['if-modified-since']);
    if (!isNaN(modified)) req.modified = modified;
  }
  base = new Date(base); // maybe use a flat int here
  this.setHeader('Last-Modified', base.toISOString());
  if (req.modified && (base.getTime() === req.modified.getTime())) {
    this.error(304); 
    return true;
  }
};

// ETags, can be weak - will prefix with "W/"
Response.prototype.etag = function(etag, weak) {
  var req = this.req;
  if (DEVELOPMENT) return;
  if (!req.etag && req.headers['if-none-match']) {
    req.etag = req.headers['if-none-match'].replace(/^W\/|["']/gi, '');
  }
  etag = etag.replace(/^W\/|['"]/gi, '');
  weak = weak ? 'W/' : '';
  this.setHeader('ETag', weak + '"' + etag + '"');
  if (req.etag && (etag === req.etag)) {
    this.error(304); 
    return true;
  }
};

// cache control 
Response.prototype.cache = function(opt) {
  var control = [];
  if (opt === false) {
    opt = { cache: false, expires: 0, revalidate: true };
  } else if (!opt || opt === true) {
    opt = { privacy: 'public', expires: arguments[1] || 2 * 60 * 60 * 1000 };
  }
  opt.maxage = opt.maxage || opt.maxAge || opt.expires;
  if (opt.privacy) { // 'private' or 'public'
    control.push(opt.privacy);
  }
  if (opt.cache === false) { 
    control.push('no-cache');
  }
  if (opt.store === false) {
    control.push('no-store');
  }
  if (opt.transform === false) {
    control.push('no-transform');
  }
  if (opt.revalidate) { // 'must' or 'proxy'
    control.push(
      (opt.revalidate === true ? 'must' : opt.revalidate) 
      + '-revalidate'
    );
  }
  if (opt.maxage != null) {
    if (opt.revalidate === 'proxy') {
      control.push('s-maxage=' + Math.floor(opt.maxage / 1000)); 
    } else {
      control.push('max-age=' + Math.floor(opt.maxage / 1000));
    }
  }
  this.setHeader('Cache-Control', control.join(', '));
  // http 1.0 doesnt support cache-control, 
  // only "expires" and "pragma"
  if (this.req.httpVersionMinor < 1) {
    if (opt.cache === false) {
      this.setHeader('Pragma', 'no-cache');
    }
    if (opt.maxage != null) {
      // invalid values such as zero expire instantly
      this.setHeader('Expires', opt.maxage 
        ? new Date(Date.now() + opt.maxage).toUTCString() 
        : '0'
      );
    }
  }
};

// set the mime type according to extension
Response.prototype.contentType = 
Response.prototype.type = function(type) {
  type = mime(type);
  if (mime.text(type)) {
    type = type + '; charset=' + this.app.cfg.charset;
  }
  this.setHeader('Content-Type', type);
};

// redirect a response and automatically
// resolve relative paths
Response.prototype.redirect = function(path, code) {
  var res = this, req = this.req, app = this.app, body;
  if (!path) path = '/';
  if (!code) code = 303;
  if (path.indexOf('//') === -1) {
    path = app.url 
      + (app._route || '') + '/' 
      + path.replace(/^\/+/, '');
  }
  // http 1.0 user agents don't understand 303's:
  // http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html
  if (code == 303 && req.httpVersionMinor < 1) {
    code = 302;
  }
  res.statusCode = +code;
  res.setHeader('Location', path);
  if (req.method !== 'HEAD') {
    body = '<!doctype html>\n<title>Redirecting</title>\n'
           + '<a href="' + path + '">' + path + '</a>';
    res.setHeader('Content-Type', 'text/html; charset=' + app.cfg.charset);
    res.setHeader('Content-Length', Buffer.byteLength(body));
  }
  res.end(body);
};

// send an http error code with an optional body
Response.prototype._error = function(code, body, unsafe) {
  var res = this, app = res.app;
  if (res.finished) return;
  res.statusCode = code = +code || 500;
  // make sure its not a 304 (not modified) or 204 (no content)
  // these response codes should not have a body
  if (code !== 204 && code !== 304 && code > 199) {
    if (app && app.cfg.error && unsafe) {
      var err = new Error(body || http.STATUS_CODES[code]);
      err.name = http.STATUS_CODES[code];
      err.code = code;
      return app.cfg.error.call(res, err, body);
    }
    body = '<!doctype html>\n<title>Error</title>\n'
           + '<h1>' + http.STATUS_CODES[code] + '</h1>\n' 
           + (body || '<p>An error occured.</p>');
    res.setHeader('Content-Type', 'text/html; charset=' + app.cfg.charset);
    res.setHeader('Content-Length', Buffer.byteLength(body));
  } else {
    res.removeHeader('Content-Type');
    res.removeHeader('Content-Length');
    res.removeHeader('Content-Language'); 
    res.removeHeader('Content-Encoding');
    res.removeHeader('Content-Range');
    res.removeHeader('Content-MD5');
    res.removeHeader('Content-Location');
    res.removeHeader('Content-Disposition');
    body = undefined;
  }
  res.end(body); 
};

Response.prototype.halt = 
Response.prototype.error = function(code, body) {
  return this._error(code, body, true);
};

// cookie with options, path defaults to '/'
Response.prototype.cookie = function(name, val, opt) {
  if (!opt) opt = {};
  if (opt.getTime || (opt && typeof opt !== 'object')) {
    opt = { expires: opt };
  }
  if (val === null) {
    opt.expires = new Date(0);
    return this.cookie(name, '0', opt);
  }
  var header = 
    qs.escape(name) + '=' + qs.escape(val)
    + (opt.expires != null ? '; expires='
      +(!opt.expires.toUTCString 
        ? new Date(Date.now() + opt.expires) 
        : opt.expires
      ).toUTCString()
    : '')
    + '; path=' + (opt.path || '/')
    + (opt.domain ? '; domain=' + opt.domain : '')
    + (opt.secure ? '; secure' : '')
    + (opt.httpOnly ? '; httpOnly' : '');
  // do not overwrite other cookies!
  if (this._headers && this._headers['set-cookie']) {
    header = [header].concat(this._headers['set-cookie']);
  }
  this.setHeader('Set-Cookie', header);
};

// set/remove/get header, automatically append
// charset to content-type
Response.prototype.header = function(name, val) {
  if (arguments.length === 1) return this.getHeader(name) || '';
  if (val == null) return this.removeHeader(name);
  return this.setHeader(name, val);
};

// ========== REQUEST ========== //

// get a header, referer will 
// fall back to the app's url
Request.prototype.header = function(name) {
  name = name.toLowerCase();
  if (name === 'referer' || name === 'referrer') {
    return this.headers['referer'] 
      || this.headers['referrer'] 
      || this.app.url + '/';
  }
  return this.headers[name] || '';
};

// get a cookie, here to keep 
// the req/res api consistent
Request.prototype.cookie = function(name) {
  return this.cookies[name] || '';
};

// check the request content type
Request.prototype.is = function(tag) {
  return this.type === mime(tag);
};

// quick and dirty way to test the accept header
Request.prototype.accept = function(tag) {
  return RegExp('\\*/\\*|(^|,)' 
    + mime(tag).replace(/\+/g, '\\+') 
    + '(,|;|$)', 'i').test(this.headers.accept);
};

// ========== ROUTING ========== //
var router = (function() {
  var methods = [ 'get', 'post', 'head', 'put', 'delete' ];
  
  // compile an expression into a route object
  var compile = function(path, handlers) {
    if (!path) return { handlers: handlers };
    var route = { 
      index: [], 
      handlers: handlers, 
      path: path 
    }; 
    if (typeof path !== 'string') {
      route.regex = path;
      return route;
    }
    route.regex = RegExp('^' + path
      //.replace(/([^\/]+)\?/g, '(?:$1)?')
      .replace(/\[/g, '(?:')
      .replace(/\]/g, ')?')
      .replace(/\.(?!\+)/g, '\\.')
      .replace(/\*/g, '.*?')
      .replace(/%/g, '\\')
      .replace(/:(\w+)/g, function(__, name) {
        route.index.push(name);
        return '([^/]+)';
      }
    ) + '$');
    return route;
  };
  
  return function router(app) {
    var routes = {};
    
    // add a route, ensure methods existence
    var add = function(method, route) {
      method = method.toUpperCase();
      routes[method] = routes[method] || [];
      routes[method].push(route);
    };
    
    // the actual function to designate routes
    app.use = app.all = app.route = function() { 
      var app = this, args = _s.call(arguments);
      var handlers = [], route, method, path;
      if (typeof args[args.length-1] === 'string') {
        method = args.pop();
      }
      // string or regex
      if (args[0].match || args[0].test) {
        path = args.shift();
      }
      // hacky way to allow arrays to be input
      args.forEach(function(val) {
        handlers = handlers.concat(val);
      });
      route = compile(path, handlers);
      if (!method) {
        methods.forEach(function(method) {
          add(method, route);
        });
      } else {
        add(method, route);
        if (method === 'get') {
          add('head', route);
        }
      }
      return this;
    };
    
    // all the route functions
    methods.forEach(function(method) {
      app[method] = function() {
        return this.route.apply(this, _s.call(arguments).concat(method));
      };
    });
    
    // do a route lookup to retrieve handlers
    var lookup = function(req) { 
      var rt = routes[req.method];
      if (!rt) return;
      
      req.params = {};
      
      var route, cap, 
          path = req.pathname, handlers = [],
          i = 0, l = rt.length;
      
      for (; i < l; i++) {
        route = rt[i];
        if (!route.path || (cap = path.match(route.regex))) {
          if (cap) cap.slice(1).forEach(function(v, i) {
            req.params[route.index[i]] = v;
          });
          handlers = handlers.concat(route.handlers);
        }
      }
      return handlers;
    };
    
    return function(req, res) {
      var app = this, i = 0, 
          stack = lookup(req);
      if (!stack) { 
        return res.error(405); 
      } else if (!stack.length) {
        return res.error(404); 
      }
      var next = function() { 
        try {
          if (stack[i]) {
            stack[i++].apply(app, [req, res, next].concat(_s.call(arguments)));
          } else {
            throw new 
              Error('Bottom of stack, no handler.');
          }
        } catch(err) {
          res.error(500, DEVELOPMENT 
            ? '<pre>' 
              + (err.stack || err + '')
                  .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                  .replace(/</g, '&lt;').replace(/>/g, '&gt;')
              + '</pre>'
            : 'Sorry, an error occurred.'
          );
          console.error(err.stack || err + '');
        }
      };
      (req.pass = res.pass = req.next = res.next = next)();
    };
  };
})();

// drop the req and res down the middleware 
// chain, then pass control to the router
var listener = function(app) {
  return function(req, res) {
    var i = 0;
    (function next() {
      if (__stack[i]) {
        __stack[i++].call(app, req, res, next);
      } else {
        app._router(req, res);
      }
    })();
  };
};

// ========== MIDDLEWARE ========== //
// - the internal middleware stack
// - this is meant to be rather malleable
var __stack = exports.stack = [
  // ========== INITIALIZATION ========== //
  function init(req, res, next) {
    res.start = Date.now();
    req.app = res.app = this;
    req.res = res; 
    res.req = req;
    next();
  },
  // ========== BASIC ========== //
  function basic(req, res, next) {
    var uri = url.parse(req.url);
    // this isnt exactly perfect, but 
    // its alright in most situations
    req.pathname = qs.unescape(uri.pathname, true);
    
    // cache the favicon
    if (req.pathname === '/favicon.ico') {
      res.setHeader('Cache-Control', 'public, max-age=14400');
      // http 1.0 agents dont support cache-control
      // http://www.w3.org/Protocols/rfc2616/rfc2616-sec14.html#sec14.9
      if (req.httpVersionMinor < 1) {
        res.setHeader('Expires', new Date(Date.now() + 14400).toUTCString());
      }
    }
    
    req.path = (function() {
      var path = (uri.pathname || '').trim()
        .replace(/^\/|\/$/g, '').split('/');
      if (!path[0]) return [];
      return path.map(function(v) {
        return qs.unescape(v, true); 
      });
    })();
    
    req.host = uri.hostname 
      || (req.headers.host || '').split(':')[0] 
      || this.host;
    
    req.query = qs.parse(uri.query, '&');
    
    req.cookies = {};
    if (req.headers.cookie) {
      var cookies = req.headers.cookie;
      if (typeof cookies !== 'string') {
        cookies = cookies.join(';');
      }
      req.cookies = qs.parse(cookies.replace(/\s*[,;]\s*/g, ';'), ';');
    }
    
    if (req.headers['content-type']) {
      var type = req.headers['content-type'].toLowerCase().split(';');
      req.type = type[0].trim();
      if (type[1]) req.charset = (type[1].split('=')[1] || '').trim();
    }
    
    // maybe move these to getters
    req.xhr = req.headers['x-requested-with'] === 'XMLHttpRequest';
    req.gzip = /gzip/i.test(req.headers['accept-encoding']);
    
    next();
  },
  // ========== BODY PARSING ========== //
  function parse(req, res, next) {
    var total = 0, limit = this.cfg.limit,
        type = req.type, body = '', decoder;
    
    req.on('data', function(data) { 
      if (total += data.length > limit) {
        this.emit('error');
      }
    }).on('error', function(err) {
      if (!err) {
        // request entity too large
        res.error(413); 
      } else {
        // bad request
        res.error(400); 
      }
      this.destroy();
    });
    
    if (req.headers['content-length'] > limit) {
      return req.emit('error');
    }
    
    // pass to a possible multipart parser
    if (type === 'multipart/form-data') {
      return next();
    }
    
    decoder = new StringDecoder('utf-8');
    req.on('data', function(data) {
      body += decoder.write(data);
    }).on('end', function() {
      decoder = null;
      req.body = body; 
      try {
        if (type === 'application/x-www-form-urlencoded') {
          req.body = qs.parse(body, '&'); 
        } else if (type === 'application/json') {
          req.body = JSON.parse(body);
        }
      } catch(err) {
        req.emit('error', err);
        return;
      }
      next(); 
    });
  }
];

// dont crash on exception
process.on('uncaughtException', function(err) {
  console.log(err.stack || err + '');
  if (DEVELOPMENT) process.exit(1);
});

// ========== MIME LOOKUPS ========== //
var mime = (function() {
  // only the most useful mime 
  // types for the web are here
  var types = {
    'atom': 'application/atom+xml',
    'bin': 'application/octet-stream',
    'bmp': 'image/bmp',
    'css': 'text/css',
    'form': 'application/x-www-form-urlencoded',
    'gif': 'image/gif',
    'gz': 'application/x-gzip',
    'htc': 'text/x-component',
    'html': 'text/html',
    'ico': 'image/vnd.microsoft.icon',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'js': 'application/javascript',
    'json': 'application/json',
    'log': 'text/plain',
    'manifest': 'text/cache-manifest',
    'mathml': 'application/mathml+xml',
    'mml': 'application/mathml+xml',
    'mp3': 'audio/mpeg',
    'mp4': 'video/mp4',
    'mpeg': 'video/mpeg',
    'mpg': 'video/mpeg',
    'ogg': 'application/ogg',
    'pdf': 'application/pdf',
    'png': 'image/png',
    'rdf': 'application/rdf+xml',
    'rss': 'application/rss+xml',
    'svg': 'image/svg+xml',
    'swf': 'application/x-shockwave-flash',
    'torrent': 'application/x-bittorrent',
    'txt': 'text/plain',
    'webm': 'video/webm',
    'xhtml': 'application/xhtml+xml',
    'xbl': 'application/xml',
    'xml': 'application/xml',
    'xsl': 'application/xml',
    'xslt': 'application/xslt+xml'
  };
  var mime = function(tag) {
    tag = (tag || '').split('.').pop();
    if (types[tag]) return types[tag];
    return (tag.indexOf('/') !== -1) 
      ? tag.split(';')[0] 
      : types.bin;
  };
  mime.text = function(type) {
    return (type
      && (type === types.js
      || type === types.json
      || type === types.form
      || type.indexOf('text/') === 0 
      || type.slice(-3) === 'xml')
    );
  };
  return mime;
})();

// ========== SESSIONS ========== //
// switched to pure cookie sessions
// similar to connect-cookie-sessions
var sessions = function(opt) {
  var crypto = require('crypto');
  
  if (!opt.secret) {
    throw new 
      Error('`secret` must be provided for sessions.');
  }
  opt.life = opt.life || 2 * 7 * 24 * 60 * 60 * 1000;
  
  var hmac = function(data) {
    return crypto.createHmac('sha256', opt.secret)
             .update(data).digest('base64');
  };
  
  // maybe swap ciphers and hmacs for better security
  var stringify = function(data, flag) {
    if (!data) return;
    var time = Date.now().toString(36);
    
    data = JSON.stringify(data);
    flag = flag || time;
    
    // hack to get around the base64 bug
    var ci = crypto.createCipher('bf-cbc', opt.secret);
    data = new Buffer(
      ci.update(data, 'utf-8', 'binary') 
      + ci.final('binary'), 'binary'
    ).toString('base64');
    
    // would normally need to qs.escape, but 
    // res.cookie takes care of this
    data = [hmac(data + flag), data, time].join(':');
    
    // http://tools.ietf.org/html/rfc6265#page-27
    if (Buffer.byteLength(data) <= 4096) {
      return data;
    }
  };
  
  var parse = function(cookie, flag) {
    if (!cookie) return;
    var s = cookie.split(':'), 
        mac = s[0], 
        data = s[1], 
        time = s[2];
    
    flag = flag || time;
    
    if (mac === hmac(data + flag) 
      && (parseInt(time, 36) > Date.now() - opt.life)) {
        var dec = crypto.createDecipher('bf-cbc', opt.secret);
        data = dec.update(data, 'base64', 'utf-8') + dec.final('utf-8');
        return JSON.parse(data);
    }
  };
  
  return function(req, res) {
    var ip = req.socket.remoteAddress;
    req.session = parse(req.cookies.S, ip) || {};
    res.writeHead = (function() {
      var _writeHead = res.writeHead;
      return function() {
        var data = stringify(req.session, ip);
        if (data) {
          res.cookie('S', data, { expires: opt.life, httpOnly: true });
        }
        res.writeHead = _writeHead;
        return _writeHead.apply(res, arguments);
      };
    })();
    res.pass();
  };
};

// ========== VIEWS ========== //
var View = function(app, name) {
  this._name = name;
  this._app = app;
  this._chain = [];
  this.locals = {};
};

exports.View = View;

View.prototype = {
  local: function(name, val) {
    if (typeof name === 'object') {
      for (var k in name) {
        this.locals[k] = name[k];
      }
      return this;
    }
    if (val === undefined) {
      return this.locals[name];
    } else if (val !== undefined) {
      this.locals[name] = val;
    } else if (val === null) {
      delete this.locals[name];
    }
    return this;
  },
  inherits: function(name) {
    if (arguments.length > 1) {
      this._chain = this._chain.concat(_s.call(arguments));
    } else {
      this._chain.push(name);
    }
    return this;
  },
  drop: function(name) {
    var i = this._chain.indexOf(name);
    if (i !== -1) this._chain.splice(i, 1);
    return this;
  },
  name: function(name) {
    this._name = name;
    return this;
  },
  show: function(name, loc) {
    if (typeof name === 'object') { 
      loc = name; 
      name = undefined; 
    }
    if (name = name || this._name) {
      this._chain.push(name);
    }
    if (loc) for (var k in loc) {
      this.locals[k] = loc[k];
    }
    var i = this._chain.length;
    while (i--) {
      this.locals.body = this._app._compile(this._chain[i])(this.locals); 
    }
    return this.locals.body;
  }
};

// add .view to the response object
Response.prototype.__defineGetter__('view', function() {
  if (!this._view) {
    var res = this;
    this._view = new View(this.app);
    this._view.render = function() {
      return res.serve(res._view.show.apply(res._view, arguments));
    };
  }
  return this._view;
});

// alias for res.view.render
Response.prototype.__defineGetter__('render', function() {
  return this.view.render;
});

Application.prototype._compile = function(name) {
  var app = this;
  if (!this._views) {
    this._views = this.cfg.views.replace(/\/+$/, '') + '/';
  }
  if (!this._cache) this._cache = {};
  if (!this._cache[name]) {
    var func = this.cfg.template(fs.readFileSync(this._views + name, 'utf-8'));
    this._cache[name] = function(locals) {
      if (!locals.partial) locals.partial = app.partial.bind(app);
      return func(locals);
    };
  }
  return this._cache[name];
};

Application.prototype.partial = 
Application.prototype.render = 
Application.prototype.show = function(name, locals) {
  return this._compile(name)(locals);
};

Response.prototype.show = function() {
  return this.app.show.apply(this.app, arguments);
};

Response.prototype.partial = function() {
  return this.serve(this.show.apply(this, arguments));
};