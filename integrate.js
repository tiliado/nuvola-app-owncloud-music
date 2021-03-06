/*
 * Copyright 2016-2018 Jiří Janoušek <janousek.jiri@gmail.com>
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

'use strict';

(function (Nuvola) {
  const DEFAULT_ADDRESS = 'http://localhost/owncloud/index.php/apps/music/'
  const ADDRESS = 'app.address'
  const ADDRESS_TYPE = 'app.address_type'
  const ADDRESS_DEFAULT = 'default'
  const ADDRESS_CUSTOM = 'custom'

  // Translations
  const _ = Nuvola.Translate.gettext

  // Create media player component
  const player = Nuvola.$object(Nuvola.MediaPlayer)

  // Handy aliases
  const PlaybackState = Nuvola.PlaybackState
  const PlayerAction = Nuvola.PlayerAction

  // Create new WebApp prototype
  const WebApp = Nuvola.$WebApp()

  WebApp._onInitAppRunner = function (emitter) {
    Nuvola.WebApp._onInitAppRunner.call(this, emitter)
    Nuvola.config.setDefault(ADDRESS_TYPE, ADDRESS_DEFAULT)
    Nuvola.config.setDefault(ADDRESS, DEFAULT_ADDRESS)
    Nuvola.core.connect('InitializationForm', this)
    Nuvola.core.connect('PreferencesForm', this)
  }

  WebApp._onInitializationForm = function (emitter, values, entries) {
    if (!Nuvola.config.hasKey(ADDRESS_TYPE)) {
      this.appendPreferences(values, entries)
    }
  }

  WebApp._onPreferencesForm = function (emitter, values, entries) {
    this.appendPreferences(values, entries)
  }

  WebApp.appendPreferences = function (values, entries) {
    values[ADDRESS_TYPE] = Nuvola.config.get(ADDRESS_TYPE)
    values[ADDRESS] = Nuvola.config.get(ADDRESS)
    entries.push(['header', _('ownCloud Music')])
    entries.push(['label', _('Specify the address of your ownCloud Music server')])
    entries.push(['option', ADDRESS_TYPE, ADDRESS_DEFAULT,
      _('Default adress:') + ' ' + DEFAULT_ADDRESS, null, [ADDRESS]])
    entries.push(['option', ADDRESS_TYPE, ADDRESS_CUSTOM,
      _('Custom address:'), [ADDRESS], null])
    entries.push(['string', ADDRESS])
  }

  WebApp._onHomePageRequest = function (emitter, result) {
    result.url = (Nuvola.config.get(ADDRESS_TYPE) === ADDRESS_CUSTOM)
      ? Nuvola.config.get(ADDRESS)
      : DEFAULT_ADDRESS
  }

  // Initialization routines
  WebApp._onInitWebWorker = function (emitter) {
    Nuvola.WebApp._onInitWebWorker.call(this, emitter)

    const state = document.readyState
    if (state === 'interactive' || state === 'complete') {
      this._onPageReady()
    } else {
      document.addEventListener('DOMContentLoaded', this._onPageReady.bind(this))
    }
  }

  // Page is ready for magic
  WebApp._onPageReady = function () {
    // Connect handler for signal ActionActivated
    Nuvola.actions.connect('ActionActivated', this)

    // Start update routine
    this.albumArt = { url: null, data: null }
    this.update()
  }

  // Extract data from the web page
  WebApp.update = function () {
    let state = PlaybackState.UNKNOWN
    const track = {
      title: null,
      artist: null,
      album: null,
      artLocation: null
    }

    const controls = document.getElementById('controls')
    if (controls && controls.classList.contains('started')) {
      try {
        if (this.getButtonEnabled(1)) {
          state = PlaybackState.PAUSED
        } else if (this.getButtonEnabled(2)) {
          state = PlaybackState.PLAYING
        }

        track.title = controls.querySelector('.song-info .title').title
        track.artist = controls.querySelector('.song-info .artist').title
        let albumArt = controls.querySelector('.albumart')
        track.album = albumArt.title
        albumArt = albumArt.getAttribute('cover')
        if (albumArt) {
          if (this.albumArt.url === albumArt) {
            track.artLocation = this.albumArt.data
          } else {
            this._downloadAlbumArt(albumArt)
          }
        } else {
          track.artLocation = null
        }
      } catch (e) {
        Nuvola.log('Parsing error: {1}', e)
      }
    }

    const time = this._getTrackTime()
    track.length = time ? time[1] : null

    this.state = state
    player.setPlaybackState(state)
    player.setTrack(track)
    player.setCanGoPrev(state !== PlaybackState.UNKNOWN)
    player.setCanGoNext(state !== PlaybackState.UNKNOWN)
    player.setCanPlay(this.getButtonEnabled(1))
    player.setCanPause(this.getButtonEnabled(2))
    player.setCanSeek(!!time)
    player.setTrackPosition(time ? time[0] : null)

    const elm = this._getVolumeSlider()
    player.updateVolume(elm ? elm.value / 100 || null : null)
    player.setCanChangeVolume(!!elm)

    const repeat = this._getRepeat()
    player.setCanRepeat(repeat !== null)
    player.setRepeatState(repeat)

    const shuffle = this._getShuffle()
    player.setCanShuffle(shuffle !== null)
    player.setShuffleState(shuffle)

    // Schedule the next update
    setTimeout(this.update.bind(this), 500)
  }

  WebApp._downloadAlbumArt = function (url) {
    this.albumArt.url = url
    this.albumArt.data = null
    Nuvola.exportImageAsBase64(url, (data) => {
      if (this.albumArt.url === url) {
        this.albumArt.data = data
      }
    })
  }

  WebApp.getAbsoluteURL = function (path) {
    const port = window.location.port ? window.location.port : (window.location.protocol === 'https:' ? '443' : '80')
    return Nuvola.format('{1}//{2}:{3}{4}', window.location.protocol, window.location.hostname, port, path || '/')
  }

  WebApp.getButton = function (index) {
    const buttons = document.querySelectorAll('#controls.started #play-controls img')
    return buttons.length ? buttons[index] : null
  }

  WebApp._getTrackTime = function () {
    const elm = document.querySelector('#controls.started .progress-info span')
    return elm ? elm.textContent.split('/') : null
  }

  WebApp._getVolumeSlider = function () {
    return document.querySelector('#controls.started .volume-control input.volume-slider')
  }

  WebApp.getButtonEnabled = function (index) {
    const button = this.getButton(index)
    return button ? !button.classList.contains('ng-hide') : false
  }

  WebApp._getRepeatButton = function () {
    return document.getElementById('repeat')
  }

  WebApp._getRepeat = function () {
    const button = this._getRepeatButton()
    if (!button) {
      return null
    }
    return button.classList.contains('active') ? Nuvola.PlayerRepeat.PLAYLIST : Nuvola.PlayerRepeat.NONE
  }

  WebApp._setRepeat = function (repeat) {
    while (repeat !== Nuvola.PlayerRepeat.TRACK && this._getRepeat() !== repeat) {
      Nuvola.clickOnElement(this._getRepeatButton())
    }
  }

  WebApp._getShuffleButton = function () {
    return document.getElementById('shuffle')
  }

  WebApp._getShuffle = function () {
    const button = this._getShuffleButton()
    return button ? button.classList.contains('active') : null
  }

  // Handler of playback actions
  WebApp._onActionActivated = function (emitter, name, param) {
    switch (name) {
      case PlayerAction.TOGGLE_PLAY:
      case PlayerAction.PLAY:
      case PlayerAction.PAUSE:
      case PlayerAction.STOP:
        Nuvola.clickOnElement(this.getButton(1))
        break
      case PlayerAction.PREV_SONG:
        Nuvola.clickOnElement(this.getButton(0))
        break
      case PlayerAction.NEXT_SONG:
        Nuvola.clickOnElement(this.getButton(3))
        break
      case PlayerAction.SEEK: {
        const elm = document.querySelector('#controls.started .progress-info .seek-bar')
        const time = this._getTrackTime()
        if (elm && time) {
          const total = Nuvola.parseTimeUsec(time[1])
          if (param > 0 && param <= total) {
            Nuvola.clickOnElement(elm, param / total, 0.5)
          }
        }
        break
      }
      case PlayerAction.CHANGE_VOLUME: {
        const volume = this._getVolumeSlider()
        if (volume) {
          Nuvola.setInputValueWithEvent(volume, 100 * param)
        }
        break
      }
      case PlayerAction.REPEAT:
        this._setRepeat(param)
        break
      case PlayerAction.SHUFFLE:
        Nuvola.clickOnElement(this._getShuffleButton())
        break
    }
  }

  WebApp.start()
})(this) // function (Nuvola)
