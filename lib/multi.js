// multipart middleware, not sure about this
module.exports = function(vanilla) {
  vanilla.multipart = function(opt) {
    try {
      var parted = require('parted');
    } catch(e) {
      var formidable = require('formidable');
    }
    return parted 
      ? function(req, res, next) {
        var type = req.headers['content-type'];
        if (type && ~type.indexOf('multipart')) {
          parted(req, next, opt);
        } else {
          next();
        }
      }
      : function(req, res, next) {
        var type = req.headers['content-type'];
        if (type && ~type.indexOf('multipart')) {
          var form = new formidable.IncomingForm();
          merge(form, opt);
          form.parse(req, function(err, fields, files) {
            if (files) for (var k in files) fields[k] = files[k].path;
            req.body = fields || {};
            next(err);
          });
        } else {
          next();
        }
      };
  };
};