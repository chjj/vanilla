// Vanilla - a sinatra-like framework for node.js
// Copyright (c) 2011, Christopher Jeffrey (MIT Licensed)

var http = require('http'),
    fs = require('fs'),
    url = require('url'), 
    qs = require('querystring');

// dev mode disables caching
var DEVELOPMENT = !!(
  process.env.DEV 
  || process.env.DEVELOPMENT 
  || process.argv.indexOf('-dev') !== -1
  || process.env.NODE_ENV === 'development'
); 

if (DEVELOPMENT) {
  console.log('\033[33m -- Starting in development mode. -- \033[39m');
}

var Request = http.IncomingMessage;
var Response = http.ServerResponse;

var _slice = [].slice;

// ========== APPLICATION ========== //
var Application = function(args) {
  if (!Array.isArray(args)) { 
    return new Application(_slice.call(arguments)); 
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
    lang: 'en',
    halt: true
  };
  this.env = DEVELOPMENT 
    ? 'development' 
    : 'production';
  this._router = router(this);
  if (args.length > 0) {
    this.route.apply(this, args);
  }
};

module.exports = exports = Application;
exports.Application = Application;

Application.listen = function() {
  return Application.prototype.listen.apply(new Application(), arguments);
};

Application.prototype.__defineGetter__('dev', function() {
  return !!(this.env === 'development');
});

// configuration - also sets internal middleware
Application.prototype.set = function(name, val) {
  if (arguments.length === 1) {
    return this.cfg[name];
  }
  if (typeof exports[name] === 'function') {
    this.route(exports[name].call(this, val));
  } else {
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
    (app.server = app.https 
      ? require('https').createServer(app.https, app._listener.bind(app))
      : http.createServer(app._listener.bind(app))
    ).listen(app.port, app.host, function() {
      console.log(
        '\033[33mVanilla\033[39m - '
        + 'Listening on port: ' 
        + app.port + '.'
      );
    });
  });
  return app;
};

// the heart of the request handling
Application.prototype._listener = function(req, res) {
  var app = this, i = 0, stack = app._router(req);
  // need to push these onto the stack
  // if there is a user error function
  // they may need to use the middleware
  if (!stack) { 
    stack = [function() { 
      res.error(405); 
    }];
  } else if (!stack.length) {
    stack.push(function() { 
      res.error(404); 
    });
  }
  if (!app._parent) {
    stack = __stack.concat(stack);
  }
  var next = function() { 
    try {
      if (stack[i]) {
        stack[i++].call(app, req, res, next);
      } else {
        throw new 
          Error('Bottom of stack, no handler.');
      }
    } catch(err) {
      err && err.name; // hacky
      res.error(500, DEVELOPMENT 
        ? '<pre>' 
          + (err.stack || (err + ''))
              .replace(/</g, '&lt;').replace(/>/g, '&gt;')
              .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
          + '</pre>'
        : 'Sorry, an error occurred.'
      );
      console.log(err.stack || err + '');
    }
  };
  (req.next = res.next = next)();
};

// mount an app, will route to the apps router
// mounted apps shouldn't have a listener or internal stack
Application.prototype.mount = function(route, app) {
  app._parent = this;
  app.__route = route = '/' + route.replace(/^\/|\/$/g, '');
  var len = route.length, slots = route.split('/').length - 1;
  this.route(route + '*', function(req, res) {
    req.app = res.app = app;
    req.__url = req.url;
    req.url = req.url.replace(route, '') || '/'; 
    
    // an insane hack to account for absolute urls.
    // absolute urls almost never get sent on the request line
    // but they CAN be according to the rfc
    if (/^([^:\/]+:)?\/\/[^\/]+$/.test(req.url)) req.url += '/';
    
    req.uri.pathname = req.pathname = req.pathname.slice(len) || '/';
    req.path = req.path.slice(slots); 
    app._listener(req, res);
    // could do app.server.emit('request', req, res);
    // that way we could use closure pattern and make
    // the listener actually private instead...
  });
};

// vhosting, examine the host header
Application.prototype.vhost = function(host, app) {
  app._parent = this;
  this.route(function(req, res, next) {
    // could do some actual pattern matching here
    // but it doesnt seem terribly necessary
    if (req.host.indexOf(host) === 0) {
      req.app = res.app = app;
      // hacky way to update the app's host
      if (!('__host' in app)) {
        app.__host = app.host;
        app.host = req.host;
      }
      app._listener(req, res);
    } else {
      next();
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
      data = req.query.callback + '(' + data + ')';
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
  res.setHeader('Content-Disposition', 
    'attachment' 
    + (file ? '; filename="' + file + '"' : '')
  );
  if (file) {
    this.type(file);
    this.send(file, func);
  }
};

// serve a static file
Response.prototype.send = function(file, func) {
  var res = this, req = this.req, app = this.app; 
  if (!file) {
    return res.error(500);
  }
  if (file.indexOf('..') !== -1) {
    return res.error(404);
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
    var error = function() {
      stream.destroy();
      if (this !== res.socket) {
        res.socket.removeListener('error', error);
      }
      if (!res.finished) res.end();
      if (func) func.apply(res, arguments);
    };
    stream.on('error', error).on('end', function() {
      res.socket.removeListener('error', error);
      if (func) func.call(res);
    }).pipe(res);
    res.socket.on('error', error);
  });
};

// caching functions - will return true or halt
// if a stale response was sent as a result
Response.prototype.modified = function(base) {
  if (DEVELOPMENT) return;
  base = new Date(base);
  this.setHeader('Last-Modified', base.toISOString());
  if (this.req.modified && (base.getTime() === this.req.modified.getTime())) {
    this.error(304); 
    if (this.app.cfg.halt) this.halt();
    return true;
  }
};

// ETags, can be weak - will prefix with "W/"
Response.prototype.etag = function(etag, weak) {
  if (DEVELOPMENT) return;
  etag = etag.replace(/^W\/|['"]/gi, '');
  weak = weak ? 'W/' : '';
  this.setHeader('ETag', weak + '"' + etag + '"');
  if (this.req.etag && (etag === this.req.etag)) {
    this.error(304); 
    if (this.app.cfg.halt) this.halt();
    return true;
  }
};

// set the mime type according to extension
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
      + (app.__route || '') + '/' 
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
    res.type('text/html');
    body = '<!doctype html><title>Redirecting</title>\n'
           + '<a href="' + path + '">' + path + '</a>';
  }
  res.end(body);
};

// send an http error code with an optional body
Response.prototype.error = function(code, body) {
  var res = this, app = res.app, err;
  if (res.finished) return;
  code = code || 500;
  res.statusCode = +code;
  // make sure its not a 304 (not modified) or 204 (no content)
  // these response codes should not have a body
  if (code != 204 && code != 304 && code > 199) {
    if (app && app.cfg.error) {
      err = new Error(body || http.STATUS_CODES[code]);
      err.name = http.STATUS_CODES[code];
      err.code = code;
      err = [err].concat(_slice.call(arguments, 2));
      return app.cfg.error.apply(res, err);
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
  var header = (
    escape(name) + '=' + escape(val)
    + (opt.expires != null ? '; expires='
      +(!opt.expires.toUTCString 
        ? new Date(Date.now() + opt.expires) 
        : opt.expires
      ).toUTCString()
    : '')
    + '; path=' + (opt.path || '/')
    + (opt.domain ? '; domain=' + opt.domain : '')
    + (opt.secure ? '; secure' : '')
    + (opt.httpOnly ? '; httpOnly' : '')
  );
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
  return RegExp('\\*/\\*|(^|,)' + mime(tag) + '(,|;|$)', 'i')
    .test(this.headers.accept);
};

// ========== ROUTING ========== //
var router = (function() {
  var methods = [
    'get', 'post', 'head', 
    'put', 'delete', 'options'
  ];
  
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
      if (!(method in routes)) {
        routes[method] = [];
      }
      routes[method].push(route);
    };
    
    // the actual function to designate routes
    app.route = function() { 
      var app = this, handlers = [], route;
      var method, path, args = _slice.call(arguments);
      if (typeof args[args.length-1] === 'string') {
        method = args.pop();
      }
      // string or regex
      if (args[0].match || args[0].test) {
        path = args.shift();
      }
      // hacky way to allow arrays to be input
      args.map(function(val) {
        handlers = handlers.concat(val);
        return null;
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
        return this.route.apply(this, _slice.call(arguments).concat(method));
      };
    });
    
    // do a route lookup to retrieve handlers
    return function lookup(req) { 
      if (!routes[req.method]) return;
      
      req.uri = req.uri || url.parse(req.url);
      req.params = {};
      
      var route, cap, 
          uri = req.uri.pathname, handlers = [],
          i = 0, l = routes[req.method].length;
      
      for (; i < l; i++) {
        route = routes[req.method][i];
        if (!route.path || (cap = uri.match(route.regex))) {
          if (cap) cap.slice(1).forEach(function(v, i) {
            req.params[route.index[i]] = v;
          });
          handlers = handlers.concat(route.handlers);
        }
      }
      return handlers;
    };
  };
})();

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
    req.pathname = req.uri.pathname;
    req.path = (function() {
      var path = (req.pathname || '').trim()
        .replace(/^\/|\/$/g, '').split('/');
      if (!path[0]) return [];
      return path.map(function(v) {
        return qs.unescape(v.trim(), true); 
      });
    })();
    
    req.host = req.uri.host || (req.headers.host || '').split(':')[0] || this.host;
    
    req.query = qs.parse(req.uri.query, '&');
    
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
    
    if (req.headers['if-none-match']) {
      req.etag = req.headers['if-none-match'].replace(/^W\/|["']/gi, '');
    }
    
    var modified = new Date(req.headers['if-modified-since']);
    if (!isNaN(modified)) req.modified = modified;
    
    // maybe move these to getters
    req.xhr = !!(req.headers['x-requested-with'] === 'XMLHttpRequest');
    req.gzip = !!/gzip/i.test(req.headers['accept-encoding']);
    
    next();
  },
  // ========== BODY PARSING ========== //
  function parse(req, res, next) {
    var limit = this.cfg.limit;
    var total = 0, body = '';
    req.on('data', function(chunk) { 
      total += chunk.length;
      if (total > limit) {
        this.emit('error');
      } else {
        body += chunk.toString('utf-8'); 
      }
    }).on('error', function(err) {
      if (!err) {
        res.error(413); // request entity too large
      } else {
        res.error(400); // bad request
      }
      this.destroy();
    }).on('end', function() {
      req.body = body; 
      try {
        if (req.type === 'application/x-www-form-urlencoded') {
          req.body = qs.parse(body, '&'); 
        } else if (req.type === 'application/json') {
          req.body = JSON.parse(body);
        }
      } catch(err) {
        req.emit('error', err);
        return;
      }
      next(); 
    });
    if (req.headers['content-length'] > limit) {
      req.emit('error');
    }
  }
];

var __break = {};
'type,stack,name,message,code,errno,toString,inspect'.split(',').forEach(function(s) {
  __break.__defineGetter__(s, function() { throw this; });
});

Response.prototype.halt = function(err) {
  if (err) { 
    this.error(err);
  } else {
    if (!this.finished) {
      this.end();
    }
  }
  throw __break;
};

Response.prototype.pass = function() {
  this.next();
  throw __break;
};

process.on('uncaughtException', function(err) {
  if (err === __break) return; // do nothing
  // restore default behavior
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
exports.sessions = function(options) {
  if (typeof options !== 'object') options = {};
  var lock = {}, total,
      life = options.life || 2 * 7 * 24 * 60 * 60 * 1000, 
      limit = options.limit || 500,
      dir = options.dir || __dirname + '/.sessions';
  
  if (!require('path').existsSync(dir)) {
    fs.mkdirSync(dir, 0777);
  }
  total = fs.readdirSync(dir).length;
  
  return function(req, res, next) {
    if (total > limit) { 
      fs.readdir(dir, function(err, list) {
        if (err || !list) return; 
        list.forEach(function(id) {
          if (lock[id]) return;
          lock[id] = {};
          fs.unlink(dir + '/' + id, function() {
            delete lock[id];
            total--;
          });
        });
      });
    }
    
    var id = req.cookies['sid'];
    if (!id) {
      id = '----'.replace(/-/g, function() {
        return Math.random().toString(36).slice(2, 10);
      });
      res.cookie('sid', id, {expires: life});
      total++;
    }
    
    res.end = (function() {
      var _end = res.end;
      return function() {
        res.end = _end;
        lock[id] = req.session;
        fs.writeFile(
          dir + '/' + id, 
          JSON.stringify(req.session), 
          function(err) {
            delete lock[id];
            //_end.apply(res, arguments);
          }
        );
        return _end.apply(res, arguments);
        //return true; 
        // return !res.output.length;
        //return res.write.apply(res, arguments);
      };
    })();
    
    if (lock[id]) {
      req.session = res.session = lock[id];
      return next();
    }
    
    fs.readFile(dir + '/' + id, 'utf-8', function(err, data) {
      try {
        req.session = res.session = JSON.parse(data);
      } catch(e) {
        req.session = res.session = {};
      }
      next();
    });
  };
};

// ========== VIEWS ========== //
var View = function(app, name) {
  this._name = name;
  this._app = app;
  this._parent = [];
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
      this._parent = this._parent.concat(_slice.call(arguments));
    } else {
      this._parent.push(name);
    }
    return this;
  },
  drop: function(name) {
    var i = this._parent.indexOf(name);
    if (i !== -1) this._parent.splice(i, 1);
    return this;
  },
  name: function(name) {
    this._name = name;
    return this;
  },
  show: function(name, loc) {
    if (!loc) { loc = name; name = undefined; }
    if (name) this._name = name;
    if (!this._name && this._parent.length) {
      this._name = this._parent.pop();
    }
    if (loc) {
      for (var k in loc) this.locals[k] = loc[k];
    }
    this.locals.partial = this._app.partial.bind(this._app);
    var out = this._app._compile(this._name)(this.locals);
    while (this._parent.length) {
      this.locals.body = this.locals.content = out;
      out = this._app._compile(this._parent.pop())(this.locals); 
    }
    return out;
  }
};

// aliases, still not sure on the names
View.prototype.subject = View.prototype.name;
View.prototype.add = View.prototype.inherits;
View.prototype.remove = View.prototype.drop;

// add .view to the response object
Response.prototype.__defineGetter__('view', function() {
  if (!this._view) {
    var res = this;
    this._view = new View(this.app);
    this._view.render = function() {
      var out = res._view.show.apply(res._view, arguments);
      return res.serve(out);
    };
  }
  return this._view;
});

// alias for res.view.render
Response.prototype.__defineGetter__('render', function() {
  return this.view.render;
});

Application.prototype._compile = (function() {
  var _inherits = function() { 
    return _slice.call(arguments).map(function(name) {
      return '-inherits ' + name + '-';
    }).join(' ');
  };
  return function(name) {
    var app = this;
    if (!app._views) {
      app._views = (app.cfg.views || app.cfg.root)
        .replace(/\/+$/, '') + '/';
    }
    if (!app._tmp) app._tmp = {};
    // add template inheritence functionality by doing some parsing post-compilation
    if (!app._tmp[name]) {
      var func = app.cfg.template(fs.readFileSync(app._views + name, 'utf-8'));
      app._tmp[name] = function(locals) {
        if (!locals.partial) locals.partial = app.partial.bind(app);
        if (!locals.inherits) locals.inherits = _inherits;
        var out = func(locals), parent = [];
        out = out.replace(/\s*-\s*inherits\s*([^-\n]+?)\s*-[\t\x20]*[\r\n]*/gi, function(__, file) {
          parent.push(file);
          return '';
        });
        while (parent.length) {
          locals.body = locals.content = out;
          out = app._compile(parent.pop())(locals); 
        }
        return out;
      };
    }
    return app._tmp[name];
  };
})();

Application.prototype.partial = 
Application.prototype.show = function(name, locals) {
  return this._compile(name)(locals);
};

Response.prototype.show = function() {
  return this.app.show.apply(this.app, arguments);
};

Response.prototype.partial = function() {
  return this.serve(this.show.apply(this, arguments));
};