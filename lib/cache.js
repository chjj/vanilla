/**
 * Serverside Caching
 */

module.exports = function(opt) {
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
