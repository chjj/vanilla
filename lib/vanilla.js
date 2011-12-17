/**
 * Vanilla (https://github.com/chjj/vanilla)
 * Modeled after connect/express/stack/creationix.
 * Copyright (c) 2011, Christopher Jeffrey. (MIT Licensed)
 */

var http = require('http')
  , path = require('path')
  , parse = require('url').parse
  , fs = require('fs')
  , join = path.join;

var Request = http.IncomingMessage
  , Response = http.ServerResponse;

var NODE_ENV = process.env.NODE_ENV
  || (~process.argv.indexOf('--dev') && 'development')
  || (~process.argv.indexOf('--test') && 'test')
  || 'production';

/**
 * HTTP
 */

var Application = function(func) {
  http.Server.call(this);
  this.init(func);
};

Application.prototype.__proto__ = http.Server.prototype;

/**
 * HTTPS
 */

Application.__defineGetter__('https', function _() {
  if (!_.https) {
    var https = require('https');

    _.https = function(opt, func) {
      https.Server.call(this, opt);
      this._https = true;
      this.init(func);
    };
    _.https.prototype.__proto__ = https.Server.prototype;

    Object.keys(Application.prototype).forEach(function(key) {
      _.https.prototype[key] = Application.prototype[key];
    });
  }
  return _.https;
});

/**
 * Vanilla
 */

var vanilla = function() {
  var args = slice.call(arguments);
  if (typeof args[0] === 'object') {
    return new Application.https(args.shift(), args);
  }
  return new Application(args);
};

vanilla.HTTPServer = Application.http = Application;
vanilla.__defineGetter__('HTTPSServer', function() {
  return Application.https;
});

/**
 * Application
 */

Application.prototype.init = function(func) {
  var self = this;

  this.stack = [];
  this.settings = {
    root: process.cwd(),
    charset: 'utf-8',
    lang: 'en',
    env: NODE_ENV
  };

  this.handle = handler(this);
  func.forEach(this.use.bind(this));

  this.__defineGetter__('router', function _() {
    if (!_.router) _.router = vanilla.router(self);
    return _.router;
  });

  this.on('request', this.handle);
  this.on('listening', function() {
    var address = this.address();
    this.port = address.port;
    this.host = address.host || '127.0.0.1';
    console.log('Listening on port %d.', this.port);
  });
};

/**
 * Configuration
 */

Application.prototype.set = function(key, val) {
  if (val === undefined) {
    return this.settings[key];
  }
  this.settings[key] = val;
};

Application.prototype.configure = function(env, func) {
  if (!func || env === this.settings.env) (func || env)();
};

Application.prototype.__defineGetter__('url', function() {
  return 'http'
    + (this._https ? 's' : '') + '://'
    + (this.settings.host || this.host)
    + (this.port != 80 && this.port != 443 ? ':' + this.port : '');
});

Application.prototype.error = function(func) {
  this._errorHandler = func;
};

/**
 * Handling
 */

Application.prototype.mount = function(route, child) {
  if (route[route.length-1] === '/') {
    route = route.slice(0, -1);
  }
  child.parent = this;
  child.route = route;
  this.use(function(req, res, next) {
    var ch = req.url[route.length];
    if (req.url.indexOf(route) === 0
        && (!ch || ch === '/')) {
      req.url = req.url.substring(route.length);

      if (req.url[0] !== '/') req.url = '/' + req.url;

      // use emit to allow regular
      // http servers to be mounted
      child.emit('request', req, res, function(err) {
        req.app = res.app = child.parent;
        req.next = res.next = next;
        req.url = join(route, req.url);
        parsePath(req);
        next(err);
      });
    } else {
      next();
    }
  });
  if (child.settings) {
    child.settings.__proto__ = this.settings;
  }
};

// vhosting, examine the host header
Application.prototype.vhost = function(host, child) {
  child.parent = this;
  child.host = host;
  this.use(function(req, res, next) {
    var host = req.headers.host;
    if (host && host.split(':')[0] === child.host) {
      child.emit('request', req, res, function(err) {
        req.app = res.app = child.parent;
        req.next = res.next = next;
        next(err);
      });
    } else {
      next();
    }
  });
  if (child.settings) {
    child.settings.__proto__ = this.settings;
  }
};

// the same model as connect for code portability.
// eventually merge this with the router completely.
// this presents potential problems:
// - a methodOverride becomes impossible
// - the stack becomes one dimensional:
//   routes have to be placed in the right spot
var handler = function(app) {
  var stack = app.stack;
  return function(req, res, out) {
    var i = 0;

    // initialize
    req.res = res;
    res.req = req;
    req.app = res.app = app;
    req.next = res.next = next;

    // parse the path
    parsePath(req);

    function next(err) {
      var func = stack[i++];
      if (!func) {
        if (out) return out(err);
        if (err) {
          if (typeof err === 'number') {
            return res.error(err);
          }
          console.error(err.stack || err + '');
          if (res.finished || res._header) return;
          res.error(500, app.settings.env === 'development'
            ? (err.stack || err + '')
            : 'Sorry, an error occurred.'
          );
        } else {
          res.error(404);
        }
        return;
      }

      var route = func.route;
      if (route) {
        var path = req.pathname
          , ch = path[route.length];

        if (path.indexOf(route) !== 0
            || (ch && ch !== '/')) {
          return next(err);
        }
      }

      try {
        if (err) {
          if (func.length === 4) {
            func(err, req, res, next);
          } else {
            next(err);
          }
        } else if (func.length < 4) {
          func(req, res, next);
        } else {
          // skip over error handlers
          next();
        }
      } catch(e) {
        next(e);
      }
    }

    next();
  };
};

Application.prototype.use = function(route) {
  var self = this
    , func = slice.call(arguments, 1);

  if (typeof route !== 'string') {
    func.unshift(route);
    route = undefined;
  } else if (route[route.length-1] === '/') {
    route = route.slice(0, -1);
  }

  func.forEach(function(func) {
    func.route = route;
    self.stack.push(func);
  });
};

/**
 * Response
 */

// update the ETag or Last-Modified header
Response.prototype.cached = function(tag) {
  if (this.app.settings.env === 'development') return false;

  var cached = typeof tag === 'string'
    ? this.ETag(tag)
    : this.lastModified(tag);

  if (cached) {
    this.statusCode = 304;
    this.end();
    return true;
  }
};

Response.prototype.lastModified = function(last) {
  var since = this.req.headers['if-modified-since'];
  this.setHeader('Last-Modified', last = last.valueOf());
  if (since) since = new Date(+since || since).valueOf();
  return last === since;
};

Response.prototype.ETag = function(etag, weak) {
  var none = this.req.headers['if-none-match'];
  this.setHeader('ETag', (weak ? 'W/' : '') + '"' + etag + '"');
  if (none) none = none.replace(/^W\/|["']/gi, '');
  return etag === none;
};

Response.prototype.type =
Response.prototype.contentType = function(type) {
  type = mime(type);
  if (mime.text(type)) {
    type += '; charset=' + this.app.settings.charset;
  }
  this.setHeader('Content-Type', type);
};

Response.prototype.setCookie =
Response.prototype.cookie = function(name, val, opt) {
  opt = opt || {};
  if (opt.getTime || (opt && typeof opt !== 'object')) {
    opt = { expires: opt };
  }
  opt.expires = opt.expires || opt.maxage || opt.maxAge;

  var header =
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
    + (opt.httpOnly ? '; httpOnly' : '');

  // do not overwrite other cookies!
  var current = this.getHeader('Set-Cookie');
  if (current) {
    header = [header].concat(current);
  }

  this.setHeader('Set-Cookie', header);
};

Response.prototype.clearCookie =
Response.prototype.uncookie = function(key, opt) {
  opt = opt || {};
  opt.expires = new Date(Date.now() - 24 * 60 * 60 * 1000);
  this.cookie(key, '0', opt);
};

Response.prototype.redirect = function(path, code) {
  var res = this
    , req = this.req
    , app = this.app;

  path = path || '/';
  code = +code || 303;

  if (!~path.indexOf('//')) {
    if (app.route) path = join(app.route, path);
    if (path[0] === '/') path = path.substring(1);
    path = 'http' + (req.socket.encrypted ? 's' : '')
           + '://' + req.headers.host + '/' + path;
  }

  // http 1.0 user agents don't understand 303's:
  // http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html
  if (code === 303 && req.httpVersionMinor < 1) {
    code = 302;
  }

  res.writeHead(code, {
    'Location': path
  });

  res.end();
};

Response.prototype.header = function(name, val) {
  return val !== undefined
    ? this.setHeader(name, val) || val
    : this.getHeader(name) || '';
};

// send an http error code
// with an optional body
Response.prototype.error = function(code, body) {
  var res = this
    , req = this.req
    , app = this.app;

  if (res.finished || res._header) {
    return console.error('res.error failed.');
  }

  // remove all headers - hack
  res._headers = {};
  res._headerName = {};

  res.statusCode = code = +code || 500;

  // 204 and 304 should not have a body
  if (code !== 204 && code !== 304 && code > 199) {
    var phrase = code + ': ' + http.STATUS_CODES[code];

    if (app._errorHandler
        && !res.errorCalled) {
      res.errorCalled = true;
      try {
        app._errorHandler({
          code: code,
          phrase: phrase,
          body: body
        }, req, res);
      } catch(e) {
        console.error(e.stack || e + '');
      }
      if (res.finished) return;
      if (res._header) return res.end('Error.');
    }

    if (!body) body = 'An error occured.';
    body = '<!doctype html>\n'
           + '<title>' + code + '</title>\n'
           + '<h1>' + phrase + '</h1>\n'
           + '<pre>' + body + '</pre>';

    res.writeHead(code, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': Buffer.byteLength(body)
    });
  } else {
    body = undefined;
  }

  res.end(body);
};

Response.prototype.send = function(data, code) {
  var res = this
    , req = this.req
    , app = this.app
    , buff;

  // no content
  if (!data && !res.statusCode) {
    return res.error(204);
  }

  res.statusCode = code || res.statusCode || 200;

  // jsonp and json
  buff = Buffer.isBuffer(data);
  if (req.query.callback) {
    res.contentType('application/javascript');
    data = req.query.callback
      + '(' + JSON.stringify(data) + ');';
  }
  if (typeof data === 'object' && !buff) {
    res.contentType('application/json');
    data = JSON.stringify(data);
  }

  // basic headers
  if (!res.getHeader('Content-Type')) {
    res.contentType('text/html');
  }
  res.setHeader('Content-Length', buff
    ? data.length
    : Buffer.byteLength(data)
  );
  res.setHeader('Content-Language', app.settings.lang);
  res.setHeader('X-UA-Compatible', 'IE=Edge,chrome=1');

  if (req.method === 'HEAD') data = undefined;

  res.end(data);
};

// serve a static file
Response.prototype.sendfile = function(file, next) {
  var res = this
    , req = this.req
    , app = this.app
    , next = next || req.next;

  if (!file) {
    return next(new Error('No file.'));
  }

  if (~file.indexOf('\0')) {
    res.statusCode = 404;
    return res.end();
  }

  if (file[0] !== '/' && app.settings.root) {
    file = join(app.settings.root, file);
  }

  fs.stat(file, function on(err, stat) {
    if (err) return next(err);

    if (!stat) {
      return next(new Error('No stat.'));
    }

    if (!stat.isFile()) {
      if (stat.isDirectory()) {
        file = join(file, 'index.html');
        return fs.stat(file, on);
      }
      return next(new Error('Not a file.'));
    }

    if (!res.getHeader('ETag')) {
      var entity = +stat.mtime + ':' + stat.size;
      res.setHeader('ETag', entity);

      if (app.settings.env !== 'development') {
        var none = req.headers['if-none-match'];
        if (none && none === entity) {
          res.statusCode = 304;
          return res.end();
        }
      }
    }

    res.statusCode = 200;
    if (!res.getHeader('Content-Type')) {
      res.contentType(file);
    }
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Accept-Ranges', 'bytes');

    if (req.headers.range) {
      var range = (function() {
        var range = req.headers.range
          .replace(/\s/g, '')
          .match(/^bytes=(\d*)-(\d*)$/i);

        if (!range) return;
        range[1] = range[1] || 0;
        range[2] = range[2] || stat.size;
        if (range[1] < range[2] && range[2] <= stat.size) {
          return { start: +range[1], end: +range[2] };
        }
      })();
      res.statusCode = range ? 206 : 416;
      res.setHeader('Content-Range', 'bytes '
        + (range ? range.start + '-' + range.end : '*')
        + '/' + stat.size
      );
    }

    if (req.method === 'HEAD') {
      return res.end();
    }

    pipefile(req, res, {
      path: file,
      next: next,
      range: range || {
        start: 0,
        end: stat.size
      }
    });
  });
};

// based on peter griess' example:
// https://gist.github.com/583150
// as well as tim smart's middleware:
// https://github.com/Tim-Smart/node-middleware
var sendfile = (function() {
  // in theory we could use the write watcher
  // thats already on the net.Socket object
  // (by way of socket._writeWatcher.start()),
  // however, lib/net.js has been completely
  // refactored for libuv, so its necessary
  // to use our own io watcher.
  var FreeList = require('freelist').FreeList
    , IOWatcher = process.binding('io_watcher').IOWatcher
    , noop = function() {};

  var watchers = new FreeList('iowatcher', 100, function() {
    return new IOWatcher();
  });

  return function(req, res, opt) {
    var file = opt.path
      , start = opt.range.start || 0
      , end = (opt.range.end || 0) - start
      , next = opt.next
      , socket = req.socket;

    fs.open(file, 'r', function(err, fd) {
      if (err) return next(err);

      // ensure headers are rendered
      if (!res._header) {
        res.writeHead(res.statusCode || 200);
      }

      // force sending of the headers
      var ret = res._send('');

      var watcher = watchers.alloc();
      // 1st is readable, 2nd is writable
      watcher.callback = function() {
        watcher.stop();
        send();
      };
      // 2nd is readable, 3rd is writable
      watcher.set(socket.fd, false, true);

      var send = function() {
        fs.sendfile(
          socket.fd, fd, start, end,
          function(err, written) {
            if (err) {
              if (err.code === 'EAGAIN') {
                return watcher.start();
              }
              return done(err);
            }

            start += written;
            end -= written;

            if (end > 0) return send();

            done();
          }
        );
      };

      var done = function(err) {
        if (res.finished) return;
        socket.removeListener('error', done);

        watcher.stop();
        watcher.callback = noop;
        watchers.free(watcher);

        fs.close(fd);

        res.end();

        if (err) {
          socket.destroy();
          next(err);
        }
      };

      socket.on('error', done);

      // if for whatever reason the buffer
      // is full, wait for it to drain first
      if (ret === false) {
        socket.once('drain', send);
      } else {
        send();
      }
    });
  };
})();

var pipefile = function(req, res, opt) {
  var file = opt.path
    , next = opt.next
    , range = opt.range
    , socket = req.socket;

  var stream = fs.createReadStream(file, range);

  var end = function(err) {
    if (res.finished) return;
    socket.removeListener('error', end);
    res.end();
    if (err) {
      socket.destroy();
      stream.destroy();
      next(err);
    }
  };

  stream
    .on('error', end)
    .on('end', end)
    .pipe(res, { end: false });

  socket.on('error', end);
};

/**
 * Request
 */

// get a header, referer will
// fall back to the app's url
Request.prototype.header = function(key) {
  var name = key.toLowerCase()
    , head = this.headers;

  if (name === 'referer' || name === 'referrer') {
    return head.referer || head.referrer
      || 'http' + (this.socket.encrypted ? 's' : '')
         + '://' + (head.host || this.app.host) + '/';
  }

  return head[name] || '';
};

// get a cookie, here
// to keep api consistent
Request.prototype.cookie = function(name) {
  return this.cookies[name] || '';
};

Request.prototype.__defineGetter__('type', function() {
  var type = this.headers['content-type'];
  return type ? type.split(';')[0].trim() : '';
});

Request.prototype.__defineGetter__('xhr', function() {
  var xhr = this.headers['x-requested-with'];
  return xhr && xhr.toLowerCase() === 'xmlhttprequest';
});

/**
 * For half-assed express/connect
 * compatibility/portability
 */

// change req.pathname -> req.path
// req.path -> req.pathname ?

// possibly bring back the old cache function !
Response.prototype.cache = function(val) {
  return this.header('Cache-Control', val);
};

Response.prototype.status = function(code) {
  this.statusCode = code;
};

Response.prototype.json = function() {
  return this.send.apply(this, arguments);
};

Response.prototype.download = function(file, name, func) {
  if (typeof name === 'function') {
    this.attachment(file);
    this.sendfile(file, name);
  } else {
    this.attachment(name);
    this.sendfile(file, func);
  }
};

Response.prototype.attachment = function(file) {
  if (file && !this.getHeader('Content-Type')) {
    this.contentType(file);
  }
  this.setHeader('Content-Disposition', 'attachment'
    + (file ? '; filename="' + path.basename(file) + '"' : ''));
};

// request

Request.prototype.param = function(name, def) {
  return (this.body && this.body[name])
    || (this.params && this.params[name])
    || this.query[name]
    || def;
};

Request.prototype.is = function(type) {
  return mime(type) === mime(this.headers['content-type']);
};

Request.prototype.accepts = function(tag) {
  var accept = this.header('Accept')
    , tag = mime(tag);
  return !!~accept.indexOf(tag)
      || !!~accept.indexOf('*/*');
};

Request.prototype.get = function(field, param) {
  if (param) throw 'implement me!';
  return this.header(field) || '';
};

Request.prototype.acceptsCharset = function(charset) {
  var accept = this.acceptedCharsets;
  return accept.length
    ? !!~accept.indexOf(charset)
    : true;
};

Request.prototype.acceptsLanguage = function(lang) {
  var accept = this.acceptedLanguages;
  return accept.length
    ? !!~accept.indexOf(lang)
    : true;
};

Request.prototype.__defineGetter__('secure', function() {
  return this.socket.encrypted;
});

Request.prototype.__defineGetter__('stale', function() {
  var res = this.res;
  var tag = res.header('ETag')
    || +res.header('Last-Modified');
  return tag && this.res.cached(tag);
});

Request.prototype.__defineGetter__('fresh', function() {
  return !this.stale;
});

Request.prototype.__defineGetter__('secure', function() {
  return this.connection.encrypted;
});

Request.prototype.__defineGetter__('accepted', function() {
  var accept = this.header('Accept') || '';
  return accept.split(/ *, */);
});

Request.prototype.__defineGetter__('acceptedLanguages', function() {
  var accept = this.header('Accept-Language') || '';
  return accept.split(/ *, */);
});

Request.prototype.__defineGetter__('acceptedCharsets', function() {
  var accept = this.header('Accept-Charset') || '';
  return accept.split(/ *, */);
});

/**
 * Views
 */

Response.prototype.local =
Response.prototype.locals = function(key, val) {
  if (!this._locals) this._locals = {};
  if (typeof key === 'object') {
    return merge(this._locals, key);
  }
  if (val === undefined) {
    return this._locals[key];
  }
  if (val !== null) {
    return this._locals[key] = val;
  } else {
    delete this._locals[key];
  }
};

Response.prototype.show = function(name, locals, layout) {
  if (typeof locals === 'string') {
    layout = locals;
    locals = undefined;
  }
  locals = merge(this._locals || (this._locals = {}), locals);
  return this.app.render(name, locals, layout);
};

Response.prototype.render = function(name, locals, layout) {
  try {
    return this.send(this.show(name, locals, layout));
  } catch(e) {
    this.req.next(e);
  }
};

Response.prototype.partial = function(name, locals) {
  return this.render(name, locals, false);
};

/**
 * Compilation
 */

Application.prototype._compile = (function() {
  // a preprocessor for
  // includes and inheritence
  var load = function(views, path) {
    var path = join(views, path)
      , temp
      , parents = []
      , i;

    temp = fs.readFileSync(path, 'utf8');
    temp = temp.replace(
      /<!extends? +"([^"]+)">/gi,
      function(__, file) {
        parents.push(file);
        return '';
      }
    );

    i = parents.length;
    while (i--) {
      temp = load(views, parents[i])
        .replace(/__body__/gi, temp);
    }

    return temp.replace(
      /<!include +"([^"]+)">/gi,
      function(__, file) {
        return load(views, file);
      }
    );
  };

  return function(name) {
    var cache = this._cache
      || (this._cache = {});

    if (!cache[name]) {
      var engine = this.settings.engine
        , views = this.settings.views;
      if (typeof engine === 'string') {
        engine = module.require
          ? module.parent.require(engine)
          : require(engine);
        this.set('engine', engine);
      }
      if (engine.compile) {
        engine = engine.compile;
        this.set('engine', engine);
      }
      cache[name] = engine(load(views, name));
    }

    return cache[name];
  };
})();

/**
 * Rendering
 */

Application.prototype.render = function(name, locals, layout) {
  var self = this;

  if (!locals) locals = {};
  if (locals.layout) {
    layout = locals.layout;
  }
  if (layout === undefined
      || layout === true) {
    layout = this.settings.layout;
  }

  locals.layout = function(l) {
    layout = l;
  };
  locals.partial = function(name, loc) {
    return self._compile(name)(merge(loc || {}, locals));
  };

  var ret = self._compile(name)(locals);
  if (layout) {
    locals.body = ret;
    ret = self._compile(layout)(locals);
  }

  return ret;
};

Application.prototype.partial = function(name, locals) {
  return this.render(name, locals, false);
};

/**
 * Middleware
 */

fs.readdirSync(__dirname).forEach(function(file) {
  var name = file.split('.')[0]
    , file = './' + file;
  if (name === 'vanilla') return;
  vanilla.__defineGetter__(name, function() {
    return require(file);
  });
});

/**
 * Helpers
 */

var escape = function(str) {
  return encodeURIComponent(str).replace(/%20/g, '+');
};

var unescape = function(str) {
  try {
    str = decodeURIComponent(str).replace(/\+/g, ' ');
  } finally {
    return str.replace(/\0/g, '');
  }
};

var parsePairs = function(str, del, eq) {
  if (!str) return {};

  var out = {}
    , s = str.split(del || '&')
    , i = s.length
    , $;

  while (i--) {
    $ = s[i].split(eq || '=');
    if ($[0]) {
      $[0] = unescape($[0]);
      $[1] = $[1] ? unescape($[1]) : '';
      out[$[0]] = $[1];
    }
  }

  return out;
};

var parsePath = function(req) {
  var uri = parse(req.url)
    , pathname = uri.pathname || '/';

  if (pathname[pathname.length-1] === '/') {
    pathname = pathname.slice(0, -1);
  }

  pathname = unescape(pathname);

  req.path = (function() {
    var path = pathname;
    if (path[0] === '/') {
      path = path.substring(1);
    }
    path = path.split('/');
    if (!path[0]) return [];
    return path;
  })();

  req.pathname = pathname || '/';

  // get rid of absolute urls
  if (~req.url.indexOf('//')) {
    req.url = req.url.replace(
      /^([^:\/]+)?\/\/[^\/]+/,
      ''
    ) || '/';
  }

  if (!req.query) {
    req.query = uri.query
      ? parsePairs(uri.query, '&')
      : {};
  }
};

var slice = [].slice;

var merge = function(o, t) {
  if (o && t) for (var k in t) o[k] = t[k];
  return o || {};
};

vanilla.parsePairs = parsePairs;
vanilla.merge = merge;

/**
 * Mime Types
 */

var mime = (function() {
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
    'ico': 'image/x-icon',
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
    'oga': 'audio/ogg',
    'ogg': 'application/ogg',
    'ogv': 'video/ogg',
    'otf': 'font/otf',
    'pdf': 'application/pdf',
    'png': 'image/png',
    'rdf': 'application/rdf+xml',
    'rss': 'application/rss+xml',
    'svg': 'image/svg+xml',
    'swf': 'application/x-shockwave-flash',
    'tar': 'application/x-tar',
    'torrent': 'application/x-bittorrent',
    'txt': 'text/plain',
    'ttf': 'font/ttf',
    'webm': 'video/webm',
    'woff': 'font/x-woff',
    'xhtml': 'application/xhtml+xml',
    'xbl': 'application/xml',
    'xml': 'application/xml',
    'xsl': 'application/xml',
    'xslt': 'application/xslt+xml',
    'zip': 'application/zip'
  };

  var mime = function(tag) {
    tag = (tag || '').split('.').pop();
    if (types[tag]) return types[tag];
    return ~tag.indexOf('/')
      ? tag.split(';')[0]
      : types.bin;
  };

  mime.text = function(type) {
    return type
      && (type === types.js
      || type === types.json
      || type === types.form
      || type.indexOf('text') === 0
      || type.slice(-3) === 'xml');
  };

  mime.types = types;
  mime.lookup = mime;

  return mime;
})();

vanilla.mime = mime;

/**
 * Expose
 */

vanilla.createServer = vanilla;
module.exports = vanilla;
