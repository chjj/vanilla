/**
 * Conditional Get
 */

// this isnt ideal if there is any middleware (like static)
// after the routes. a one dimensional stack would solve
// this problem (router + request listener). it may be
// better just to use the req cache api.
module.exports = function(opt) {
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
