/**
 * Error Handler
 */

var http = require('http');

module.exports = function(opt) {
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
