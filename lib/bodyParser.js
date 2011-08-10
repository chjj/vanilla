/**
 * Body Parser
 */

var parsePairs = module.parent.exports.parsePairs;

module.exports = function(opt) {
  opt = opt || {};

  var limit = opt.limit || Infinity
    , multi = opt.multipart && vanilla.multipart(opt)
    , StringDecoder = require('string_decoder').StringDecoder;

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

    if (multi && ~type.indexOf('multipart')) {
      return multi(req, res, next);
    }

    decode = new StringDecoder('utf8');

    req.on('data', function(data) {
      body += decode.write(data);
      if (total += data.length > limit) {
        req.socket.destroy();
      }
    }).on('error', function(err) {
      req.socket.destroy();
      next(err);
    }).on('end', function() {
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
