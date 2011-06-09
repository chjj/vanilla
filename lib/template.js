// liquor templates - https://github.com/chjj/liquor
var liquor = (function() {
  var each = function(obj, func, con) {
    if (!obj) return;
    if (typeof obj.length === 'number' && typeof obj !== 'function') {
      for (var i = 0, l = obj.length; i < l; i++) {
        if (func.call(con || obj[i], obj[i], i, obj) === false) break;
      }
    } else {
      var k = Object.keys(obj), i = 0, l = k.length;
      for (; i < l; i++) {
        if (func.call(con || obj[k[i]], obj[k[i]], k[i], obj) === false) break;
      }
    }
  };
  return function(str, opt) {
    str = str.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/"/g, '\\"');
    var each = /([ \t]*)@:([^\s:]+):[ \t]*([^\n]*(?:\n+\1(?:[ ]{2}|\t)[^\n]+)*)/;
    while (each.test(str)) {
      str = str.replace(each, '\n$1`each($2, function(v) {`$3  $1\n$1`})`');
    }
    var cond = /([ \t]*)(?:\?|(!)):([^\s:]+):[ \t]*([^\n]*(?:\n+\1(?:[ ]{2}|\t)[^\n]+)*)/;
    while (cond.test(str)) {
      str = str.replace(cond, 
        '\n$1`if ($2(typeof $3 !== "undefined" && $3)) {`$4  $1\n$1`}`'
      );
    }
    str = str.replace(/`([^`]+)`/g, '"); $1; __out.push("');
    str = str.replace(/#{([^}]+)}/g, '", ($1), "');
    str = 'with($) { var __out = []; __out.push("' 
          + str + '"); return __out.join(""); }';
    str = str.replace(/\n/g, '\\n');
    var func = new Function('$', str);
    return function(locals) {
      var $ = locals || {};
      $.each = each;
      return func($);
    };
  };
})();
module.exports = liquor;