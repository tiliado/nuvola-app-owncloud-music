/*
 * Copyright 2016 Jiří Janoušek <janousek.jiri@gmail.com>
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met: 
 * 
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer. 
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution. 
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

"use strict";

(function(Nuvola)
{
var DEFAULT_ADDRESS = "http://localhost/owncloud/index.php/apps/music/";
var ADDRESS = "app.address";
var ADDRESS_TYPE = "app.address_type";
var ADDRESS_DEFAULT = "default";
var ADDRESS_CUSTOM = "custom";

// Translations
var _ = Nuvola.Translate.gettext;

// Create media player component
var player = Nuvola.$object(Nuvola.MediaPlayer);

// Handy aliases
var PlaybackState = Nuvola.PlaybackState;
var PlayerAction = Nuvola.PlayerAction;

// Create new WebApp prototype
var WebApp = Nuvola.$WebApp();

WebApp._onInitAppRunner = function(emitter)
{
    Nuvola.WebApp._onInitAppRunner.call(this, emitter);
    Nuvola.config.setDefault(ADDRESS_TYPE, ADDRESS_DEFAULT);
    Nuvola.config.setDefault(ADDRESS, DEFAULT_ADDRESS);
    Nuvola.core.connect("InitializationForm", this);
    Nuvola.core.connect("PreferencesForm", this);
}

WebApp._onInitializationForm = function(emitter, values, entries)
{
    if (!Nuvola.config.hasKey(ADDRESS_TYPE))
        this.appendPreferences(values, entries);
}

WebApp._onPreferencesForm = function(emitter, values, entries)
{
    this.appendPreferences(values, entries);
}

WebApp.appendPreferences = function(values, entries)
{
    values[ADDRESS_TYPE] = Nuvola.config.get(ADDRESS_TYPE);
    values[ADDRESS] = Nuvola.config.get(ADDRESS);
    entries.push(["header", _("ownCloud Music")]);
    entries.push(["label", _("Specify the address of your ownCloud Music server")]);
    entries.push(["option", ADDRESS_TYPE, ADDRESS_DEFAULT,
        _("Default adress:") + " " + DEFAULT_ADDRESS, null, [ADDRESS]]);
    entries.push(["option", ADDRESS_TYPE, ADDRESS_CUSTOM,
        _("Custom address:"), [ADDRESS], null]);
    entries.push(["string", ADDRESS]);
}

WebApp._onHomePageRequest = function(emitter, result)
{
    result.url = (Nuvola.config.get(ADDRESS_TYPE) === ADDRESS_CUSTOM)
        ? Nuvola.config.get(ADDRESS) : DEFAULT_ADDRESS;
}

// Initialization routines
WebApp._onInitWebWorker = function(emitter)
{
    Nuvola.WebApp._onInitWebWorker.call(this, emitter);
    
    if (!Nuvola.VERSION || Nuvola.VERSION < 30100)
        alert(Nuvola.format(
            "This web app requires Nuvola Player 3.1.0 or greater. Your version is {1}.{2}.{3}",
            Nuvola.VERSION_MAJOR, Nuvola.VERSION_MINOR, Nuvola.VERSION_BUGFIX));
    
    var state = document.readyState;
    if (state === "interactive" || state === "complete")
        this._onPageReady();
    else
        document.addEventListener("DOMContentLoaded", this._onPageReady.bind(this));
}

// Page is ready for magic
WebApp._onPageReady = function()
{
    // Connect handler for signal ActionActivated
    Nuvola.actions.connect("ActionActivated", this);

    // Start update routine
    this.update();
}

// Extract data from the web page
WebApp.update = function()
{
    var state = PlaybackState.UNKNOWN;
    var track = {
        title: null,
        artist: null,
        album: null,
        artLocation: null
    }
    
    var controls = document.getElementById("controls");
    if (controls && controls.classList.contains('started'))
    {
        try
        {
            if (this.getButtonEnabled(1))
                state = PlaybackState.PAUSED;
            else if (this.getButtonEnabled(2))
                state = PlaybackState.PLAYING;
            
            track.title = controls.querySelector(".song-info .title").title;
            track.artist = controls.querySelector(".song-info .artist").title;
            var albumArt = controls.querySelector(".albumart");
            track.album = albumArt.title;
            albumArt = albumArt.getAttribute("cover");
            
            // TODO: Album art - it's necessary to download raw bytes and send it to Nuvola.
            // track.artLocation = albumArt ? this.getAbsoluteURL(albumArt) : null;
        }
        catch (e)
        {
            Nuvola.log("Parsing error: {1}", e);
        }
    }
    
    this.state = state;
    player.setPlaybackState(state);
    player.setTrack(track);
    player.setCanGoPrev(state !== PlaybackState.UNKNOWN);
    player.setCanGoNext(state !== PlaybackState.UNKNOWN);
    player.setCanPlay(this.getButtonEnabled(2));
    player.setCanPause(this.getButtonEnabled(1));

    // Schedule the next update
    setTimeout(this.update.bind(this), 500);
}

WebApp.getAbsoluteURL = function(path)
{
    var port = location.port ? location.port : (location.protocol === "https:" ? "443" : "80");
    return Nuvola.format("{1}//{2}:{3}{4}", location.protocol, location.hostname, port, path || "/");
}

WebApp.getButton = function(index)
{
    var buttons = document.querySelectorAll("#controls.started #play-controls img");
    return buttons.length ? buttons[index] : null;
}

WebApp.getButtonEnabled = function(index)
{
    var button = this.getButton(index);
    return button ? !button.classList.contains('ng-hide') : false;
}

// Handler of playback actions
WebApp._onActionActivated = function(emitter, name, param)
{
    switch (name)
    {
    case PlayerAction.TOGGLE_PLAY:
    case PlayerAction.PLAY:
    case PlayerAction.PAUSE:
    case PlayerAction.STOP:
        Nuvola.clickOnElement(this.getButton(1));
        break;
    case PlayerAction.PREV_SONG:
        Nuvola.clickOnElement(this.getButton(0));
        break;
    case PlayerAction.NEXT_SONG:
        Nuvola.clickOnElement(this.getButton(3));
        break;
    }
}

WebApp.start();

})(this);  // function(Nuvola)
