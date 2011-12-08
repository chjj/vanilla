/**
 * Compression
 */

var zlib = require('zlib')
  , deflate = zlib.createDeflate
  , gzip = zlib.createGzip;

var isText = module.parent.exports.mime.text;

module.exports = function(options) {
  // options = options || {
  //   level: 9,
  //   windowBits: 15,
  //   memLevel: 9,
  //   strategy: 4
  // };
  return function(req, res, next) {
    res.setHeader('Vary', 'Accept-Encoding');

    var accept = req.headers['accept-encoding']
      , compress
      , algo
      , zip;

    if (!accept) return next();

    if (accept.trim() === '*'
        || ~accept.indexOf('gzip')) {
      algo = 'gzip';
      compress = gzip;
    } else if (~accept.indexOf('deflate')) {
      algo = 'deflate';
      compress = deflate;
    } else {
      return next();
    }

    var writeHead = res.writeHead;
    res.writeHead = function() {
      res.writeHead = writeHead;

      var head = arguments[2] || arguments[1] || 0;

      var type = head['Content-Type']
        || res.getHeader('Content-Type')
        || '';

      if (~type.indexOf('charset') || isText(type)) {
        if (head) {
          delete head['Content-Length'];
          delete head['Content-Encoding'];
        }

        res.setHeader('Content-Encoding', algo);
        res.removeHeader('Content-Length');

        zip = compress(options);

        zip.on('data', function(data) {
          write.call(res, data);
        });

        zip.on('end', function() {
          end.call(res);
        });

        zip.on('error', function(err) {
          if (!res.finished) end.call(res);
          console.error(err.stack || err + '');
        });
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

      if (!zip) {
        return write.apply(res, arguments);
      }

      if (data) {
        if (enc) data = new Buffer(data, enc);
        return zip.write(data);
      }
    };

    var end = res.end;
    res.end = function(data, enc) {
      res.write = write;
      res.end = end;

      if (!res._header) {
        res.writeHead(res.statusCode || 200);
      }

      if (!zip) {
        return end.apply(res, arguments);
      }

      if (data) {
        if (enc) data = new Buffer(data, enc);
        zip.write(data);
      }

      return zip.end();
    };

    next();
  };
};
