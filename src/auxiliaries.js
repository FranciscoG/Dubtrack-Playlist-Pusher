// == helper functions ==

// from:https://github.com/jserz/js_piece/blob/master/DOM/ChildNode/remove()/remove().md
(function(arr) {
  arr.forEach(function(item) {
    if (item.hasOwnProperty("remove")) {
      return;
    }
    Object.defineProperty(item, "remove", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: function remove() {
        if (this.parentNode !== null) this.parentNode.removeChild(this);
      }
    });
  });
})([Element.prototype, CharacterData.prototype, DocumentType.prototype]);

// error handler
export function errorHandler(message) {
  console.error(message);
  alert(message);
}

// decided to use XMLHttpRequest instead of window.fetch so I don't
// have to rewrite all the calls to the fetch api
export function fetch(name, url, callback) {
  var request = new XMLHttpRequest();
  request.open("GET", url, true);

  request.onload = function() {
    if (request.status >= 200 && request.status < 400) {
      // Success!
      var data = JSON.parse(request.responseText);
      callback(data);
    } else {
      // We reached our target server, but it returned an error
      errorHandler(
        `Error ${request.status} fetching ${name}: ${request.message}.`
      );
    }
  };

  request.onerror = function() {
    // There was a connection error of some sort
    errorHandler(`Connection error fetching ${name}`);
  };

  request.send();
}

/**
 * Pure JS version of jQuery's $.getScript
 */
export function getScript(name, ex, url, callback) {
  if (ex in window && typeof callback === "function") {
    return callback();
  }

  var script = document.createElement("script");
  var prior = document.getElementsByTagName("script")[0];
  script.async = 1;

  script.onload = script.onreadystatechange = function(_, isAbort) {
    if (
      isAbort ||
      !script.readyState ||
      /loaded|complete/.test(script.readyState)
    ) {
      script.onload = script.onreadystatechange = null;
      script = undefined;

      if (!isAbort) {
        if (callback) callback();
      } else {
        return errorHandler(
          `Error loading ${name} script: script file loaded, but apparently failed initializing. Maybe your browser is unsupported?`
        );
      }
    }
  };

  script.onerror = function(err) {
    errorHandler(`Error loading ${name} script: " + ${JSON.stringify(err)}`);
  };

  script.src = url;
  prior.parentNode.insertBefore(script, prior);
}

export function loadCSS(id, href) {
  document.getElementById(id).remove();
  var link = document.createElement("link");
  link.setAttribute("rel", "stylesheet");
  link.id = id;
  link.href = href;
  document.head.appendChild(link);
}

export function click(el) {
  // For a full list of event types: https://developer.mozilla.org/en-US/docs/Web/API/document.createEvent
  var event = document.createEvent("HTMLEvents");
  event.initEvent('click', true, false);
  el.dispatchEvent(event);
}
