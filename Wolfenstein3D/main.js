(function(Application, Window, GUI, Dialogs, Utils, API, VFS) {

  var GUIElement = OSjs.Core.GUIElement;

  function IframeElement(name, src, cb) {
    this.frameSource = src;
    this.frameCallback = cb || function() {};
    this.frameWindow = null;
    this.frame = null;

    GUIElement.apply(this, [name, {
      isIframe: true
    }]);
  }

  IframeElement.prototype = Object.create(GUIElement.prototype);

  IframeElement.prototype.init = function() {
    var self = this;
    var el = GUIElement.prototype.init.apply(this, ['GUIWolfenstenIframe']);
    this.frame = document.createElement('iframe');
    this.frame.onload = function() {
      self.frameWindow = self.frame.contentWindow;
      self.frameCallback(self.frameWindow);
    };
    this.frame.src = this.frameSource;
    this.frame.frameborder = '0';
    el.appendChild(this.frame);
    return el;
  };

  /////////////////////////////////////////////////////////////////////////////
  // WINDOWS
  /////////////////////////////////////////////////////////////////////////////

  /**
   * Main Window Constructor
   */
  var ApplicationWolfensteinWindow = function(app, metadata) {
    Window.apply(this, ['Wolfenstein3D', {
      icon: metadata.icon,
      title: metadata.name,
      width: 640,
      height: 400,
      allow_resise: false,
      allow_restore: false,
      allow_maximize: false
    }, app]);

    this.iframeWindow = null;
  };

  ApplicationWolfensteinWindow.prototype = Object.create(Window.prototype);

  ApplicationWolfensteinWindow.prototype.init = function(wmRef, app) {
    var self = this;
    var root = Window.prototype.init.apply(this, arguments);
    var src = API.getApplicationResource(app, 'data/index.html');

    var w = this._addGUIElement(new IframeElement('WolfensteinIframe', src, function(contentWindow) {
      self._addHook('focus', function() {
        if ( contentWindow ) {
          contentWindow.postMessage('resume', window.location.href);

          // This also happens within 'onmessage' in iframe
          contentWindow.focus();
          w.frame.focus();
        }
      });
      self._addHook('blur', function() {
        if ( contentWindow ) {
          contentWindow.postMessage('pause', window.location.href);

          // This also happens within 'onmessage' in iframe
          contentWindow.blur();
          w.frame.blur();
        }
      });
    }), root);

    return root;
  };

  ApplicationWolfensteinWindow.prototype._inited = function() {
    Window.prototype._inited.apply(this, arguments);
  };

  ApplicationWolfensteinWindow.prototype.destroy = function() {
    Window.prototype.destroy.apply(this, arguments);
  };

  /////////////////////////////////////////////////////////////////////////////
  // APPLICATION
  /////////////////////////////////////////////////////////////////////////////

  /**
   * Application constructor
   */
  var ApplicationWolfenstein = function(args, metadata) {
    Application.apply(this, ['ApplicationWolfenstein', args, metadata]);
  };

  ApplicationWolfenstein.prototype = Object.create(Application.prototype);

  ApplicationWolfenstein.prototype.destroy = function() {
    return Application.prototype.destroy.apply(this, arguments);
  };

  ApplicationWolfenstein.prototype.init = function(settings, metadata) {
    var self = this;

    Application.prototype.init.apply(this, arguments);

    // Create your main window
    var mainWindow = this._addWindow(new ApplicationWolfensteinWindow(this, metadata));
  };

  ApplicationWolfenstein.prototype._onMessage = function(obj, msg, args) {
    Application.prototype._onMessage.apply(this, arguments);

    // Make sure we kill our application if main window was closed
    if ( msg == 'destroyWindow' && obj._name === 'ApplicationWolfensteinWindow' ) {
      this.destroy();
    }
  };

  //
  // EXPORTS
  //
  OSjs.Applications = OSjs.Applications || {};
  OSjs.Applications.ApplicationWolfenstein = OSjs.Applications.ApplicationWolfenstein || {};
  OSjs.Applications.ApplicationWolfenstein.Class = ApplicationWolfenstein;

})(OSjs.Core.Application, OSjs.Core.Window, OSjs.GUI, OSjs.Dialogs, OSjs.Utils, OSjs.API, OSjs.VFS);
