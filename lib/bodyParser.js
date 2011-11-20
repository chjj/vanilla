/**
 * Body Parser
 */

var parsePairs = module.parent.exports.parsePairs;

var StringDecoder = require('string_decoder').StringDecoder;

module.exports = function(opt) {
  if (opt.parted) {
    try {
      delete opt.parted;
      return require('parted')(opt);
    } catch(e) {
      ; // nothing
    }
  }

  opt = opt || {};

  var limit = opt.limit || Infinity

  return function(req, res, next) {
    if (req.method === 'GET'
        || req.method === 'HEAD'
        || req.body) return next();

    var body = ''
      , total = 0
      , type = req.headers['content-type']
      , decode;

    if (type) type = type.split(';')[0].trim();

    if (req.headers['content-length'] > limit) {
      res.statusCode = 413;
      res.end();
      return req.socket.destroy();
    }

    decode = new StringDecoder('utf8');

    req.on('data', function(data) {
      body += decode.write(data);
      total += data.length;
      if (total > limit) {
        req.socket.destroy();
      }
    });

    res.on('error', function(err) {
      req.socket.destroy();
      next(err);
    });

    res.on('end', function() {
      try {
        switch (type) {
          case 'application/x-www-form-urlencoded':
            req.body = parsePairs(body, '&');
            break;
          case 'application/json':
            req.body = JSON.parse(body);
            break;
          default:
            req.body = body;
            break;
        }
      } catch(e) {
        return next(e);
      }
      next();
    });
  };
};
