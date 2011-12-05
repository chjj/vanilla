/**
 * Log
 */

var fs = require('fs');

module.exports = function(opt) {
  opt = opt || {};
  if (typeof opt === 'string') {
    opt = { path: opt };
  }

  var out = []
    , written = 0
    , path = opt.path || '/tmp/http.log'
    , limit = opt.limit || 10 * 1024 * 1024
    , log = opt.stream || fs.createWriteStream(path);

  var push = function(data) {
    if (written > limit) return;
    var len = out.push(data);
    written += data.length;
    if (len >= 20) {
      log.write(out.join('\n') + '\n');
      out = [];
    }
  };

  return function(req, res, next) {
    if (req.pathname === '/favicon.ico'
        || req._logged) return next();
    req._logged = true;

    var start = Date.now()
      , head = req.headers
      , writeHead = res.writeHead;

    res.writeHead = function(code) {
      res.writeHead = writeHead;
      push(
        req.method + ' "' + req.url + '"'
        + ' from [' + req.socket.remoteAddress + ']'
        + ' at [' + (new Date()).toISOString() + ']'
        + ' -> ' + (code || res.statusCode)
        + ' (' + (Date.now() - start) + 'ms)' + '\n'
        + '  Referrer: ' + (head.referrer || head.referer || 'None') + '\n'
        + '  User-Agent: ' + (head['user-agent'] || 'Unknown') + ')' + '\n'
      );
      return writeHead.apply(res, arguments);
    };
    next();
  };
};
