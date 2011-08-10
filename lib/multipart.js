/**
 * Multipart
 */

var merge = module.parent.exports.merge;

module.exports = function(opt) {
  var parted
    , formidable;

  try {
    parted = require('parted');
    return parted.middleware(opt);
  } finally {
    ;
  }

  formidable = require('formidable');

  return function(req, res, next) {
    var type = req.headers['content-type'];
    if (type && ~type.indexOf('multipart')) {
      var form = new formidable.IncomingForm();
      merge(form, opt);
      form.parse(req, function(err, fields, files) {
        if (files) for (var k in files) {
          fields[k] = files[k].path;
        }
        req.body = fields || {};
        next(err);
      });
    } else {
      next();
    }
  };
};


