(function(Application, Window, GUI, Dialogs, Utils, API, VFS) {


  /////////////////////////////////////////////////////////////////////////////
  // WINDOWS
  /////////////////////////////////////////////////////////////////////////////

  /**
   * Main Window Constructor
   */
  var ApplicationWolfensteinWindow = function(app, metadata) {
    Window.apply(this, ['ApplicationWolfensteinWindow', {
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

    this._addGUIElement(new GUI.IFrame('WolfensteinIframe', {
      src: src,
      onFocus: function(win, frame) {
        win.postMessage('resume', window.location.href);
      },
      onBlur: function(win, frame) {
        win.postMessage('pause', window.location.href);
      }
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
