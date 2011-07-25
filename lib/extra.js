// this isnt ideal if there is any middleware (like static)
// after the routes. a one dimensional stack would solve
// this problem (router + request listener). it may be
// better just to use the req cache api.
vanilla.conditionalGet = function(opt) {
  var check = opt.check || opt;
  return function(req, res, next) {
    if (req.method !== 'GET'
        && req.method !== 'HEAD') return next();
    check(req, res, function(tag) {
      if (!tag) return next();
      if (typeof tag === 'string') {
        tag = tag.replace(/^W\/|["']/gi, '');
        res.setHeader('ETag', '"' + tag + '"');
        var none = req.headers['if-none-match'];
        if (none) {
          none = none.replace(/^W\/|["']/gi, '');
          if (tag !== none) {
            return next();
          }
        } else {
          return next();
        }
      } else {
        tag = tag.valueOf();
        res.setHeader('Last-Modified', tag);
        var since = req.headers['if-modified-since'];
        if (since) {
          since = since.valueOf();
          if (tag !== since) {
            return next();
          }
        } else {
          return next();
        }
      }
      res.statusCode = 304;
      res.end();
    });
  };
};

// serverside caching
vanilla.cache = function(opt) {
  if (typeof opt === 'function') {
    opt = { check: opt };
  }

  var cache = {}
    , total = 0
    , check = opt.check
    , flag = opt.hash
    , max = opt.max || 10 * 1024 * 1024
    , time;

  if (!check) {
    time = opt.time || 2 * 60 * 1000 * 1000;
    check = function(req, res, next) {
      next(Date.now() - time);
    };
  }

  if (!flag) {
    flag = function(req) {
      return req.url + req.headers.cookie;
    };
  }

  return function(req, res, next) {
    if (req.method !== 'GET'
        && req.method !== 'HEAD') return next();
    check(req, res, function(time) {
      if (!time) return next();

      var hash = flag(req)
        , slot;

      if (cache[hash]) {
        slot = cache[hash];
        if (slot.time >= time) {
          res.writeHead(slot.code, slot.headers);
          return res.end(slot.body);
        } else {
          total -= slot.body.length;
          delete cache[hash];
          return next();
        }
      }

      if (total > max) {
        total = 0;
        cache = {};
      }

      var send = res.send;
      res.send = function(data) {
        res.send = send;

        var code
          , headers
          , writeHead = res.writeHead
          , storeHeader = res._storeHeader
          , slot;

        res.writeHead = function(c) {
          res.writeHead = writeHead;
          code = c;
          return writeHead.apply(res, arguments);
        };

        res._storeHeader = function(_, h) {
          res._storeHeader = storeHeader;
          headers = h;
          return storeHeader.apply(res, arguments);
        };

        var ret = send.apply(res, arguments);

        if (code === 200 && res.cache !== false) {
          slot = cache[hash] = {};
          slot.code = code;
          slot.headers = headers;
          slot.body = Buffer.isBuffer(data)
                    ? data 
                    : new Buffer(data);
          slot.time = Date.now();
          total += slot.body.length;
        }

        return ret;
      };

      next();
    });
  };
};

vanilla.multipart = function(opt) {
  var parted
    , formidable;

  try {
    parted = require('parted');
    return parted.middleware(opt);
  } finally {
    ;
  }

  formidable = require('formidable');

  return function(req, res, next) {
    var type = req.headers['content-type'];
    if (type && ~type.indexOf('multipart')) {
      var form = new formidable.IncomingForm();
      merge(form, opt);
      form.parse(req, function(err, fields, files) {
        if (files) for (var k in files) {
          fields[k] = files[k].path;
        }
        req.body = fields || {};
        next(err);
      });
    } else {
      next();
    }
  };
};

vanilla.errorHandler = function(opt) {
  opt = opt || {};

  var codes = http.STATUS_CODES
    , stream = opt.stream || process.stderr
    , handle = opt.handle;

  var write = function(err) {
    err = err.stack || err;
    stream.write(err + '\n');
  };

  if (!handle) {
    handle = function(err, req, res, code, phrase) {
      res.writeHead(code, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(phrase)
      });
      res.end(phrase);
    };
  }

  process.nextTick(function() {
    if (process.listeners('uncaughtException').length < 1) {
      process.on('uncaughtException', write);
    }
  });

  return function(err, req, res, next) {
    // hack
    res._headers = {};
    res._headerNames = {};

    try {
      var code = err.code || err;
      if (!codes[code]) code = 500;
      handle(
          err
        , req
        , res
        , code
        , code + ': ' 
          + codes[code]
      );
      if (code === 500) write(err);
    } catch(err) {
      write(err);
      next(err);
    }
  };
};

/**
 * Usage:
 * app.use(
 *   vanilla.robots({
 *     'user-agent': '*',
 *     'disallow': ['/files', '/other'],
 *     'sitemap': '/sitemap.xml'
 *   })
 * );
 */

vanilla.robots = function(opt) {
  var head
    , key
    , out = [];

  for (key in opt) {
    key = key[0].toUpperCase() 
          + key.substring(1);
    out.concat.call(opt[key])
      .forEach(function(val) {
        out.push(key + ': ' + val);
      });
  }

  out = new Buffer(out.join('\n'));
  head = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': out.length,
    'Cache-Control': 'public, max-age=86400'
  };

  return function(req, res, next) {
    if (req.pathname === '/robots.txt') {
      if (req.httpVersionMinor < 1) {
        res.setHeader('Expires', 
                      new Date(Date.now() + 86400000).toUTCString());
      }
      res.writeHead(200, head);
      res.end(out);
    } else {
      next();
    }
  };
};