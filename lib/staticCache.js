/**
 * Static Cache
 */

// concerned about the usefulness of
// this middleware. it would be useless
// if sendfile(2) is used.

module.exports = function(options) {
  var limit = options.limit;

  var cache = {}
    , total = 0;

  return function(req, res, next) {
    if (req.method !== 'GET'
        && req.method !== 'HEAD') return next();

    var file = req.pathname
      , shouldCache;

    var writeHead = res.writeHead
    res.writeHead = function() {
      res.writeHead = writeHead;

      var type = res.getHeader('Content-Type')
        , static = type && res.getHeader('Accept-Ranges');

      if (static
          && !~type.indexOf(';')
          && !cache[file]
          && total < limit) {
        shouldCache = true;
        cache[file] = [];
      } else {
        res.write = write;
        res.end = end;
      }

      return writeHead.apply(res, arguments);
    };

    var write = res.write;
    res.write = function(data, enc) {
      if (!res._header) {
        res.writeHead(res.statusCode || 200);
      }

      if (shouldCache && data) {
        cache[file].push([data, enc]);
        total += data.length;
      }

      return write.apply(res, arguments);
    };

    var end = res.end;
    res.end = function(data, enc) {
      res.write = write;
      res.end = end;

      if (!res._header) {
        res.writeHead(res.statusCode || 200);
      }

      if (shouldCache) {
        if (data) {
          cache[file].push([data, enc]);
          total += data.length;
        }
        cache[file].done = true;
        cache[file].head = cloneHead(res._headers, res._headerNames);
      }

      return end.apply(res, arguments);
    };

    if (cache[file]
        && cache[file].done
        && !req.headers.range) {
      var c = cache[file]
        , h = c.head
        , l = c.length
        , i = 0;

      if (h.ETag === req.headers['if-none-match']) {
        res.writeHead(304, h);
        return res.end();
      }

      res.writeHead(200, h);

      if (req.method === 'HEAD') {
        return res.end();
      }

      (function next() {
        var chunk = c[i++];
        if (!chunk) return res.end();
        if (res.write(chunk[0], chunk[1]) === false) {
          res.once('drain', next);
        } else {
          next();
        }
      })();

      return;
    }

    next();
  };
};

var cloneHead = function(obj, names) {
  var keys = Object.keys(obj)
    , i = keys.length
    , ret = {};

  while (i--) {
    ret[names[keys[i]]] = obj[keys[i]];
  }

  return ret;
};
