/**
 * Response Time
 */

module.exports = function() {
  return function(req, res, next) {
    if (req.pathname === '/favicon.ico'
        || res._timed) return next();
    res._timed = true;

    var end = res.end
      , start = Date.now();

    res.end = function() {
      res.end = end;
      var ret = end.apply(res, arguments);
      console.log('Response Time: %s ms for %s %s',
        (Date.now() - start), req.method, req.url
      );
      return ret;
    };
    next();
  };
};
