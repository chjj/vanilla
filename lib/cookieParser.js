/**
 * Cookie Parser
 */

var parsePairs = module.parent.exports.parsePairs;

module.exports = function() {
  return function(req, res, next) {
    if (req.cookies) return next();

    req.cookies = {};

    if (req.headers.cookie) {
      try {
        var cookies = req.headers.cookie;
        if (typeof cookies !== 'string') {
          cookies = cookies.join(';');
        }
        cookies = cookies.replace(/ *[,;] */g, ';');
        req.cookies = parsePairs(cookies, ';');
      } catch(e) {
        return next(e);
      }
    }

    next();
  };
};
