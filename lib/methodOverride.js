/**
 * Method Override
 */

module.exports = function() {
  return function(req, res, next) {
    if (req.query._method) {
      req._method = req.method;
      req.method = req.query._method.toUpperCase();
      delete req.query._method;
    }
    next();
  };
};
