/**
 * Compression
 */

var zlib = require('zlib')
  , deflate = zlib.createDeflate
  , gzip = zlib.createGzip;

module.exports = function(options) {
  /* options = {
       level: 9,
       windowBits: 15,
       memLevel: 9,
       strategy: 4
     }; */
  return function(req, res, next) {
    res.setHeader('Vary', 'Accept-Encoding');

    var accept = req.headers['accept-encoding']
      , compress
      , algo
      , zip;

    if (!accept) return next();

    accept = accept.trim().toLowerCase();

    if (accept === '*' || ~accept.indexOf('gzip')) {
      algo = 'gzip';
      compress = gzip;
    } else if (~accept.indexOf('deflate')) {
      algo = 'deflate';
      compress = deflate;
    } else {
      return next();
    }

    //if (!/gzip|\*/i.test(accept)) return next();

    var write = res.write;
    res.write = function(data, enc) {
      if (!res._header) {
        res.writeHead(res.statusCode || 200);
      }
      return zip.write(enc
        ? new Buffer(data, enc)
        : data);
    };

    var end = res.end;
    res.end = function(data, enc) {
      if (data) res.write(data, enc);
      return zip.end();
    };

    // slight problem down here
    // we *could* hook write and end
    // inside the writeHead hook
    // however, when writeHead is called
    // implicitly, write is below it on
    // the stack. so hooking write would
    // do nothing. therefore, we need to
    // do something infinitely more hacky
    // and hook write from the beginning.

    // it might be better to hook into
    // _storeHeader right here, but
    // writeHead seems less hacky.
    var writeHead = res.writeHead;
    res.writeHead = function() {
      res.writeHead = writeHead;

      var type = res.getHeader('Content-Type') || '';

      if (~type.indexOf('charset')) {
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
          //next(err);
        });
      } else {
        res.write = write;
        res.end = end;
        // if write is below us in
        // the stack, need to set
        // zip to res too.
        zip = res;
      }

      return writeHead.apply(res, arguments);
    };

    next();
  };
};
