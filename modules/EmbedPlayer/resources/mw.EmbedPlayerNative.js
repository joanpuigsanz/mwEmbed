/**
 * Native embed library:
 *
 * Enables embedPlayer support for native html5 browser playback system
 */
(function (mw, $) {
	"use strict";
	
	mw.EmbedPlayerNative = {

		//Instance Name
		instanceOf: 'Native',

		bindPostfix: '.nativePlayer',

		playerPrefix: 'EmbedPlayerNative',

		// Flag to only load the video ( not play it )
		onlyLoadFlag: false,

		//Callback fired once video is "loaded"
		onLoadedCallback: null,

		// The previous "currentTime" to sniff seek actions
		// NOTE the bug where onSeeked does not seem fire consistently may no longer be applicable
		prevCurrentTime: -1,

		// Store the progress event ( updated during monitor )
		progressEventData: null,

		// If the media loaded event has been fired
		mediaLoadedFlag: null,

		// If network errors should triggered.
		triggerNetworkErrorsFlag: true,

		// A flag to keep the video tag offscreen.
		keepPlayerOffScreenFlag: null,

		// A flag to designate the first play event, as to not propagate the native event in this case
		ignoreNextNativeEvent: null,

		// A local var to store the current seek target time:
		currentSeekTargetTime: null,

		// Flag for ignoring next native error we get from the player.
		ignoreNextError: false,

		keepNativeFullScreen: false,

		// Flag for ignoring double play on iPhone
		playing: false,

		// Disable switch source callback
		disableSwitchSourceCallback: false,

		// Flag specifying if a mobile device already played. If true - mobile device can autoPlay
		mobilePlayed: false,
		// All the native events per:
		// http://www.w3.org/TR/html5/video.html#mediaevents
		nativeEvents: [
			'loadstart',
			'progress',
			'suspend',
			'abort',
			'error',
			'emptied',
			'stalled',
			'play',
			'pause',
			'loadedmetadata',
			'loadeddata',
			'waiting',
			'playing',
			'canplay',
			'canplaythrough',
			'seeking',
			'seeked',
			'timeupdate',
			'ended',
			'ratechange',
			'durationchange',
			'volumechange'
		],

		// Native player supported feature set
		supports: {
			'playHead': true,
			'pause': true,
			'fullscreen': true,
			'SourceSelector': true,
			'timeDisplay': true,
			'volumeControl': true,
			'overlays': true
		},
		setup: function (readyCallback) {
			var _this = this;
			this._propagateEvents = true;
			$(this.getPlayerElement()).css('position', 'absolute');
			if (this.inline) {
				$(this.getPlayerElement()).attr('webkit-playsinline', '');
			}
			readyCallback();

			// disable network errors on unload:
			$(window).unload(function () {
				_this.triggerNetworkErrorsFlag = false;
				// remove any active error:
				if (_this.layoutBuilder) {
					_this.layoutBuilder.closeAlert();
				}
			});
		},
		/**
		 * Updates the supported features given the "type of player"
		 */
		updateFeatureSupport: function () {
			// The native controls function checks for overly support
			// especially the special case of iPad in-dom or not support
			if (this.useNativePlayerControls()) {
				this.supports.overlays = false;
			}
			// iOS and Mobile Chrome do not support volume control
			if (!this.supportsVolumeControl()) {
				this.supports.volumeControl = false;
			}
			// Check if we already have a selected source and a player in the page,
			if (this.getPlayerElement() && this.getSrc() && !mw.isIE()) {
				$(this.getPlayerElement()).attr('src', this.getSrc());
			}
			// Check if we already have a video element an apply bindings ( for native interfaces )
			if (this.getPlayerElement()) {
				this.applyMediaElementBindings();
				this.playbackRate = this.getPlayerElement().playbackRate;
			}

			this.parent_updateFeatureSupport();
		},
		supportsVolumeControl: function () {
			return  !( mw.isIpad() || mw.isAndroid() || mw.isMobileChrome() || this.useNativePlayerControls() );
		},
		/**
		 * Adds an HTML screen and moves the video tag off screen, works around some iPhone bugs
		 */
		addPlayScreenWithNativeOffScreen: function () {
			if (!mw.isIphone()) {
				return;
			}
			var _this = this;
			// Hide the player offscreen:
			if (!this.inline) {
				this.hidePlayerOffScreen();
				this.keepPlayerOffScreenFlag = true;
			}


			// Add an image poster:
			var posterSrc = ( this.poster ) ? this.poster :
				mw.getConfig('EmbedPlayer.BlackPixel');
			// Check if the poster is already present:
			if ($(this).find('.playerPoster').length) {
				$(this).find('.playerPoster').attr('src', posterSrc);
			} else {
				$(this).append(
					$('<img />')
						.attr('src', posterSrc)
						.addClass('playerPoster')
						.load(function () {
							_this.applyIntrinsicAspect();
							$('.playerPoster').attr('alt', _this.posterAlt);
						})
				);
			}
			$(this).show();
		},
		changeMediaCallback: function (callback) {
			// Check if we have source
			if (!this.getSource()) {
				callback();
				return;
			}
			var _this = this;
			// If switching a Persistent native player update the source:
			// ( stop and play won't refresh the source  )
			_this.switchPlaySource(this.getSource(), function () {
				if (!_this.autoplay  || ( _this.autoplay && mw.isMobileDevice()) ) {
					// pause is need to keep pause state, while
					// switch source calls .play() that some browsers require.
					// to reflect source switches. Playlists handle pause state so no need to pause in playlist
					_this.ignoreNextNativeEvent = true;
					if ( !_this.playlist ){
						_this.pause();
					}
					_this.updatePosterHTML();
				}
				callback();
			});
		},
		disablePlayer: function () {
			$(this.getPlayerElement()).css('position', 'static');
		},
		/**
		 * Return the embed code
		 */
		embedPlayerHTML: function () {
			var _this = this;
			var vid = _this.getPlayerElement();
			this.ignoreNextNativeEvent = true;

			// empty out any existing sources:
			if (vid && !mw.isIphone()) {  //if track element attached for iphone it won't be deleted
				$(vid).empty();
			}

			if (vid && $(vid).attr('src') == this.getSrc(this.currentTime)) {
				_this.postEmbedActions();
				return;
			}
			this.log("embedPlayerHTML > play url:" + this.getSrc(this.currentTime) + ' startOffset: ' + this.start_ntp + ' end: ' + this.end_ntp);

			// Check if using native controls and already the "pid" is already in the DOM
			if (this.isPersistentNativePlayer() && vid) {
				_this.postEmbedActions();
				return;
			}
			// Reset some play state flags:
			_this.bufferStartFlag = false;
			_this.bufferEndFlag = false;

			$(this).html(
				_this.getNativePlayerHtml()
			);

			// Directly run postEmbedActions ( if playerElement is not available it will retry )
			_this.postEmbedActions();
		},

		/**
		 * Get the native player embed code.
		 *
		 * @param {object} playerAttribtues Attributes to be override in function call
		 * @return {object} cssSet css to apply to the player
		 */
		getNativePlayerHtml: function (playerAttribtues, cssSet) {
			if (!playerAttribtues) {
				playerAttribtues = {};
			}
			// Update required attributes
			if (!playerAttribtues['id']) {
				playerAttribtues['id'] = this.pid;
			}
			if (!playerAttribtues['src']) {
				playerAttribtues['src'] = this.getSrc(this.currentTime);
			}

			// If autoplay pass along to attribute ( needed for iPad / iPod no js autoplay support
			if (this.autoplay) {
				playerAttribtues['autoplay'] = 'true';
			}

			if (!cssSet) {
				cssSet = {};
			}

			// Set default width height to 100% of parent container
			if (!cssSet['width']) cssSet['width'] = '100%';
			if (!cssSet['height']) cssSet['height'] = '100%';

			// Also need to set the loop param directly for iPad / iPod
			if (this.loop) {
				playerAttribtues['loop'] = 'true';
			}

			var tagName = this.isAudio() ? 'audio' : 'video';

			return    $('<' + tagName + ' />')
				// Add the special nativeEmbedPlayer to avoid any rewrites of of this video tag.
				.addClass('nativeEmbedPlayerPid')
				.attr(playerAttribtues)
				.css(cssSet);
		},
		/**
		 * returns true if device can auto play
		 */
		canAutoPlay: function () {
			return (!mw.isAndroid() && !mw.isMobileChrome() && !mw.isIOS()) || this.mobilePlayed;
		},

		/**
		 * Post element javascript, binds event listeners and starts monitor
		 */
		postEmbedActions: function () {
			var _this = this;

			// Setup local pointer:
			var vid = this.getPlayerElement();
			if (!vid) {
				return;
			}
			// Update the player source ( if needed )
			if ($(vid).attr('src') != this.getSrc(this.currentTime) && !mw.isIE()) {
				$(vid).attr('src', this.getSrc(this.currentTime));
			}

			if (this.muted) {
				vid.muted = true;
			}

			// Update the EmbedPlayer.WebKitAllowAirplay option:
			if (mw.getConfig('EmbedPlayer.WebKitAllowAirplay')) {
				$(vid).attr('x-webkit-airplay', "allow");
			}
			// make sure to display native controls if enabled:
			if (this.useNativePlayerControls()) {
				$(vid).attr('controls', "true");
			}
			// make sure the video is show ( both display and visibility attributes )
			$( vid ).show().css('visibility', '');

			// Apply media element bindings:
			_this.applyMediaElementBindings();

			// Make sure we start playing in the correct place:
			if (this.currentTime != vid.currentTime) {
				var waitReadyStateCount = 0;
				var checkReadyState = function () {
					if (vid.readyState > 0) {
						vid.currentTime = this.currentTime;
						return;
					}
					if (waitReadyStateCount > 1000) {
						_this.log("Error: could not run native seek");
						return;
					}
					waitReadyStateCount++;
					setTimeout(function () {
						checkReadyState();
					}, 10);
				};
			}
		},
		/**
		 * Apply media element bindings
		 */
		applyMediaElementBindings: function () {
			var _this = this;
			this.log("MediaElementBindings");
			var vid = this.getPlayerElement();
			if (!vid) {
				this.log(" Error: applyMediaElementBindings without player elemnet");
				return;
			}
			$.each(_this.nativeEvents, function (inx, eventName) {
				if (mw.isIOS8_9() && mw.isIphone() && eventName === "seeking") {
					return;
				}
				$(vid).unbind(eventName + '.embedPlayerNative').bind(eventName + '.embedPlayerNative', function () {
					// make sure we propagating events, and the current instance is in the correct closure.
					if (_this._propagateEvents && _this.instanceOf == 'Native') {
						var argArray = $.makeArray(arguments);
						// Check if there is local handler:
						if (_this[ '_on' + eventName ]) {
							_this[ '_on' + eventName ].apply(_this, argArray);
						} else {
							// No local handler directly propagate the event to the abstract object:
							$(_this).trigger(eventName, argArray);
						}
					}
				});
			});
		},

		// basic monitor function to update buffer
		monitor: function () {
			var _this = this;
			var vid = _this.getPlayerElement();
			// Update the bufferedPercent
			if (vid && vid.buffered && vid.buffered.end && vid.duration) {
				try {
					this.updateBufferStatus(vid.buffered.end(vid.buffered.length - 1) / vid.duration);
				} catch (e) {
					// opera does not have buffered.end zero index support ?
				}
			}
			_this.parent_monitor();
		},


		/**
		 * Issue a seeking request.
		 *
		 * @param {Float} percent
		 * @param {bollean} stopAfterSeek if the player should stop after the seek
		 */
		doSeek: function (seekTime) {
			var _this = this;

			if (mw.isIOS()) {
				this.hidePlayerOffScreen();
			}

			if ( seekTime === 0 && this.isLive() && mw.isIpad() && !mw.isIOS8_9() ) {
				//seek to 0 doesn't work well on live on iOS < 8
				seekTime = 0.01;
				this.log( "doSeek: fix seekTime to 0.01" );
			}

			this.unbindHelper("seeked.doSeek").bindOnceHelper("seeked.doSeek", function(){
				// restore iPad video position:
				_this.restorePlayerOnScreen();
			});
			this.setCurrentTime(seekTime);
		},
		canSeek: function(deferred, callbackCount){
			var vid = this.getPlayerElement();
			var checkVideoStateDeferred = deferred || $.Deferred();
			var _this = this;
			if( !callbackCount ){
				callbackCount = 0;
			}

			if (this.currentState === "end" && mw.isIphone()) {
				vid.play();
				this.playing = true;
			}

			// some initial calls to prime the seek:
			if (vid.currentTime === 0 && callbackCount === 0) {
				// when seeking turn off preload none and issue a load call.
				$(vid)
					.attr('preload', 'auto')
					[0].load();
			}

			var videoReadyState = mw.isIOS8_9() ? 2 : 1; // on iOS8 wait for video state 1 (dataloaded) instead of 1 (metadataloaded)
			if ( (vid.readyState < videoReadyState) || (this.getDuration() === 0)) {
				// if on the first call ( and video not ready issue load, play
				if (callbackCount == 0 && vid.paused) {
					this.stopEventPropagation();
					this.isWaitingForSeekReady = true;
					var vidObj = $(vid);
					var eventName = mw.isIOS() ? "canplaythrough.seekPrePlay" : "canplay.seekPrePlay";
					vidObj.off(eventName).one(eventName, function () {
						_this.isWaitingForSeekReady = false;
						_this.restoreEventPropagation();
						if (vid.duration > 0) {
							_this.log("player can seek");
							clearTimeout( _this.canSeekTimeout );
							this.canSeekTimeout = null;
							setTimeout( function () {
								return checkVideoStateDeferred.resolve();
							}, 10 );
						} else {
							_this.log("player can't seek - video duration not available, wait for video duration update");
						}
					});
					// manually trigger the loadedmetadata since stopEventPropagation was called but we must have this event triggered during seek operation (SUP-4237)
					vidObj.off('loadedmetadata.seekPrePlay').one('loadedmetadata.seekPrePlay', function () {
						_this._onloadedmetadata();
					});
					this.log("player can't seek - try to init video element ready state");
					vid.load();
					vid.play();
				}
				// Try to seek for 15 seconds:
				if (callbackCount >= 15) {
					this.log("Error:: with seek request, media never in ready state");
					return checkVideoStateDeferred.resolve();
				}
				this.log("player can't seek - wait video element ready state");
				this.canSeekTimeout = setTimeout(function () {
					this.canSeekTimeout = null;
					_this.canSeek(checkVideoStateDeferred, callbackCount + 1);
				}, 1000);
			} else {
				setTimeout(function(){
					_this.log("player can seek");
					if (_this.isWaitingForSeekReady){
						_this.restoreEventPropagation();
						_this.isWaitingForSeekReady = false;
					}
					return checkVideoStateDeferred.resolve();
				}, 10);
			}
			return checkVideoStateDeferred;
		},

		/**
		 * Set the current time with a callback
		 *
		 * @param {Float} position
		 * 		Seconds to set the time to
		 * @param {Function} callback
		 * 		Function called once time has been set.
		 */
		setCurrentTime: function( seekTime ) {
			this.log("setCurrentTime seekTime:" + seekTime );
			// Try to update the playerElement time:
			try {
				var vid = this.getPlayerElement();
				vid.currentTime = this.currentSeekTargetTime;
			} catch (e) {
				this.log("Error: Could not set video tag seekTime");
				this.triggerHelper("seeked");
			}
		},
		/**
		 * Get the embed player time
		 */
		getPlayerElementTime: function () {
			var _this = this;
			// Make sure we have .vid obj
			this.getPlayerElement();
			if (!this.playerElement) {
				this.log('getPlayerElementTime: ' + this.id + ' not in dom ( stop monitor)');
				this.stop();
				return false;
			}
			var ct = this.playerElement.currentTime;
			// Return 0 or a positive number:
			if (!ct || isNaN(ct) || ct < 0 || !isFinite(ct)) {
				return 0;
			}
			// Return the playerElement currentTime
			return this.playerElement.currentTime;
		},

		// Update the poster src ( updates the native object if in dom )
		updatePoster: function (src) {
			// Also update the embedPlayer poster
			this.parent_updatePoster(src);

			if (mw.getConfig('EmbedPlayer.HidePosterOnStart') === true) {
				return;
			}
			if (this.getPlayerElement()) {
				$(this.getPlayerElement()).attr('poster', src);
			}
		},
		/**
		 * Empty player sources from the active video tag element
		 */
		emptySources: function () {
			var _this = this;
			//When empty source - we get a video error (from latest version)
			this.ignoreNextError = true;
			setTimeout(function () {
				//reset the flag
				_this.ignoreNextError = false;
			}, 5000);
			// empty player source:
			$(this.getPlayerElement()).attr('src', null)
				.attr('poster', null);
			// empty out generic sources:
			this.parent_emptySources();
		},
		/**
		 * Android Live doesn't send timeupdate events
		 * @returns {boolean}
		 */
		isTimeUpdateSupported: function () {
			if (this.isLive() && mw.isAndroid()) {
				return false;
			} else {
				return true;
			}
		},
		/**
		 * playerSwitchSource switches the player source working around a few bugs in browsers
		 *
		 * @param {Object}
		 *            Source object to switch to.
		 * @param {function}
		 *            switchCallback Function to call once the source has been switched
		 * @param {function}
		 *            doneCallback Function to call once the clip has completed playback
		 */
		playerSwitchSource: function (source, switchCallback, doneCallback) {
			var _this = this;
			var src = source.getSrc();
			var vid = this.getPlayerElement();
			var switchBindPostfix = '.playerSwitchSource';
			this.isPauseLoading = false;

			// Make sure the switch source is different:
			if (!src || src == vid.src) {
				if ($.isFunction(switchCallback)) {
					switchCallback(vid);
				}
				// Delay done callback to allow any non-blocking switch callback code to fully execute
				if ($.isFunction(doneCallback)) {
					_this.ignoreNextError = false;
					doneCallback();
				}
				return;
			}

			// remove preload=none
			$(vid).attr('preload', 'auto');

			// only display switch msg if actually switching:
			this.log('playerSwitchSource: ' + src + ' native time: ' + vid.currentTime);

			// set the first embed play flag to true, avoid duplicate onPlay event:
			this.ignoreNextNativeEvent = true;

			// Update some parent embedPlayer vars:
			this.currentTime = 0;
			this.previousTime = 0;
			if (vid) {
				try {
					// Remove all old switch player bindings
					$(vid).unbind(switchBindPostfix);

					// pause before switching source
					vid.pause();

					var originalControlsState = vid.controls;
					// Hide controls ( to not display native play button while switching sources )
					vid.removeAttribute('controls');

					// dissable seeking ( if we were in a seeking state before the switch )
					if (_this.isFlavorSwitching) {
						_this.seeking = true;
					} else {
						_this.seeking = false;
					}

					// Workaround for 'changeMedia' on Android & iOS
					// When changing media and not playing entry before spinner is stuck on black screen
					if (!_this.firstPlay) {
						// add a loading indicator:
						_this.addPlayerSpinner();
						//workaround bug where thumbnail appears for a second, add black layer on top of the player
						_this.addBlackScreen();
					}

					// empty out any existing sources:
					$(vid).empty();

					if (mw.isIOS7() && mw.isIphone()) {
						vid.src = null;
						var sourceTag = document.createElement('source');
						sourceTag.setAttribute('src', src);
						vid.appendChild(sourceTag);
					} else {
						// Do the actual source switch:
						vid.src = src;
					}
					// load the updated src
					//only on desktop safari we need to load - otherwise we get the same movie play again.
					if (mw.isDesktopSafari()) {
						vid.load();
					}

					// hide the player offscreen while we switch
					_this.hidePlayerOffScreen();

					// restore position once we have metadata
					$(vid).bind('loadedmetadata' + switchBindPostfix, function () {
						$(vid).unbind('loadedmetadata' + switchBindPostfix);
						_this.log(" playerSwitchSource> loadedmetadata callback for:" + src);
						// ( do not update the duration )
						// Android and iOS <5 gives bogus duration, depend on external metadata

						// keep going towards playback! if  switchCallback has not been called yet
						// we need the "playing" event to trigger the switch callback
						if (!mw.isIOS71() && $.isFunction(switchCallback) && !_this.isVideoSiblingEnabled()) {
							vid.play();
						} else {
							_this.removeBlackScreen();
						}
					});

					$(vid).bind('pause' + switchBindPostfix, function () {
						_this.log("playerSwitchSource> received pause during switching, issue play to continue source switching!")
						$(vid).unbind('pause' + switchBindPostfix);
						vid.play();
					});

					var handleSwitchCallback = function () {
						//Clear pause binding on switch exit in case it wasn't triggered.
						$(vid).unbind('pause' + switchBindPostfix);
						// restore video position ( now that we are playing with metadata size  )
						_this.restorePlayerOnScreen();
						// play hide loading spinner:
						_this.hideSpinner();
						// Restore
						vid.controls = originalControlsState;
						_this.ignoreNextError = false;
						_this.ignoreNextNativeEvent = false;
						// check if we have a switch callback and issue it now:
						if ($.isFunction(switchCallback)) {
							_this.log(" playerSwitchSource> call switchCallback");
							// restore event propagation:
							switchCallback(vid);
							switchCallback = null;
						}
					};

					// once playing issue callbacks:
					$(vid).bind('playing' + switchBindPostfix, function () {
						$(vid).unbind('playing' + switchBindPostfix);
						_this.log(" playerSwitchSource> playing callback: " + vid.currentTime);
						handleSwitchCallback();
						setTimeout(function () {
							_this.removeBlackScreen();
						}, 100);

					});

					// Add the end binding if we have a post event:
					if ($.isFunction(doneCallback)) {
						var sentDoneCallback = false;
						$(vid).bind('ended' + switchBindPostfix, function (event) {
							if (_this.disableSwitchSourceCallback) {
								return;
							}
							// Check if Timeout was activated, if true clear
							if (_this.mobileChromeTimeoutID) {
								clearTimeout(_this.mobileChromeTimeoutID);
								_this.mobileChromeTimeoutID = null;
							}
							sentDoneCallback = true;
							// remove end binding:
							$(vid).unbind(switchBindPostfix);
							// issue the doneCallback
							doneCallback();

							// Support loop for older iOS
							// Temporarily disabled pending more testing or refactor into a better place.
							//if ( _this.loop ) {
							//	vid.play();
							//}
							return false;
						});

						// Check if ended event was fired on chrome (android devices), if not fix by time difference approximation
						if (mw.isMobileChrome()) {
							$(vid).bind('timeupdate' + switchBindPostfix, function (e) {
								var _this = this;
								var timeDiff = this.duration - this.currentTime;

								if (timeDiff < 0.5 && this.duration != 0) {
									_this.mobileChromeTimeoutID = setTimeout(function () {
										_this.mobileChromeTimeoutID = null;
										// Check if timeDiff was changed in the last 2 seconds
										if (timeDiff <= (_this.duration - _this.currentTime)) {
											_this.log('playerSwitchSource> error in getting ended event, issue doneCallback directly.');
											if (!sentDoneCallback) {
												$(vid).unbind(switchBindPostfix);
												sentDoneCallback = true;
												doneCallback();
											}

										}
									}, 2000);
								}
							});
						}
					}

					// issue the play request:
					vid.play();
					if (mw.isMobileDevice()) {
						setTimeout(function () {
							handleSwitchCallback();
						}, 100);
					}
					// check if ready state is loading or doing anything ( iOS play restriction )
					// give iOS 5 seconds to ~start~ loading media
					setTimeout(function () {
						// Check that the player got out of readyState 0
						if (vid.readyState === 0 && $.isFunction(switchCallback) && !_this.canAutoPlay()) {
							_this.log(" Error: possible play without user click gesture, issue callback");
							// hand off to the swtich callback method.
							handleSwitchCallback();
							// make sure we are in a pause state ( failed to change and play media );
							_this.pause();
						}
					}, 10000);


				} catch (e) {
					this.log("Error: switching source playback failed");
				}
			}
		},
		hidePlayerOffScreen: function (vid) {
			var vid = this.getPlayerElement();
			// Move the video offscreen while it switches ( hides quicktime logo only applies to iPad )
			$(vid).css({
				'position': 'absolute',
				'left': '-4048px'
			});
		},
		restorePlayerOnScreen: function (vid) {
			var vid = this.getPlayerElement();
			if (this.keepPlayerOffScreenFlag || this.instanceOf != 'Native') {
				return;
			}
			// Remove any poster div ( that would overlay the player )
			if (!this.isAudioPlayer && !mw.getConfig("EmbedPlayer.KeepPoster") === true)
				$(this).find('.playerPoster').remove();
			// Restore video pos before calling sync syze
			$(vid).css({
				'left': '0px',
				'top': '0px'
			});
		},
		/**
		 * Pause the video playback
		 * calls parent_pause to update the interface
		 */
		pause: function () {
			this.getPlayerElement();
			this.parent_pause(); // update interface
			if (this.playerElement) { // update player
				this.playerElement.pause();
			}

		},

		/**
		 * Play back the video stream
		 * calls parent_play to update the interface
		 */
		play: function () {
			var vid = this.getPlayerElement();
			// parent.$('body').append( $('<a />').attr({ 'style': 'position: absolute; top:0;left:0;', 'target': '_blank', 'href': this.getPlayerElement().src }).text('SRC') );
			var _this = this;

			// if starting playback from stoped state and not in an ad or otherise blocked controls state:
			// restore player:
			if (this.isStopped() && this._playContorls) {
				this.restorePlayerOnScreen();
			}

			var doPlay = function () {
				// Run parent play:
				if (_this.parent_play()) {
					if (_this.getPlayerElement() && _this.getPlayerElement().play) {
						_this.log(" issue native play call:");
						// make sure the source is set:
						if ($(vid).attr('src') != _this.getSrc()) {
							$(vid).attr('src', _this.getSrc());
						}
						_this.hideSpinnerOncePlaying();
						// make sure the video tag is displayed:
						$(_this.getPlayerElement()).show();
						// Remove any poster div ( that would overlay the player )
						if (!_this.isAudio()) {
							_this.removePoster();
						}
						// if using native controls make sure the inteface does not block the native controls interface:
						if (_this.useNativePlayerControls() && $(_this).find('video ').length == 0) {
							$(_this).hide();
						}
						// if it's iOS8 the player won't play
						if (!mw.isIOS8_9()) {
							// update the preload attribute to auto
							$(_this.getPlayerElement()).attr('preload', "auto");
						}
						// issue a play request
						if ( !_this.playing ) {
							vid.play();
						}
						_this.mobilePlayed = true;
					}
				} else {
					_this.log(" parent play returned false, don't issue play on native element");
				}
			};

			//workaround for the bug:
			// HLS on native android initially starts with no video, only audio. We need to pause/play after movie starts.
			// livestream is already handled in KWidgetSupprt
			if (this.firstPlay && mw.isAndroid4andUp() && mw.getConfig('EmbedPlayer.twoPhaseManifestHlsAndroid') && this.mediaElement.selectedSource.getMIMEType() == 'application/vnd.apple.mpegurl' && !this.isLive()) {
				this.resolveSrcURL(this.mediaElement.selectedSource.src).then(function (resolvedSrc) {
					_this.mediaElement.selectedSource.setSrc(resolvedSrc);
					var firstTimePostfix = ".firstTime";
					$(vid).bind('timeupdate' + firstTimePostfix, function () {
						if (_this.currentTime >= 1) {
							$(vid).unbind('timeupdate' + firstTimePostfix);
							vid.pause();
							vid.play();
						}
					});
					doPlay();
				});
			} else {
				doPlay();
			}
		},

		/**
		 * Stop the player ( end all listeners )
		 */
		stop: function () {
			var _this = this;
			if (this.playerElement && this.playerElement.currentTime) {
				this.playerElement.pause();
			}
			this.parent_stop();
		},

		/**
		 * Toggle the Mute
		 * calls parent_toggleMute to update the interface
		 */
		toggleMute: function (forceMute) {
			this.parent_toggleMute(forceMute);
			this.getPlayerElement();
			if (this.playerElement)
				this.playerElement.muted = this.muted;
		},

		/**
		 * Update Volume
		 *
		 * @param {Float} percent Value between 0 and 1 to set audio volume
		 */
		setPlayerElementVolume: function (percent) {
			if (this.getPlayerElement()) {
				// Disable mute if positive volume
				if (percent != 0) {
					this.playerElement.muted = false;
				}
				this.playerElement.volume = percent;
			}
		},

		/**
		 * get Volume
		 *
		 * @return {Float}
		 *    Audio volume between 0 and 1.
		 */
		getPlayerElementVolume: function () {
			if (this.getPlayerElement()) {
				return this.playerElement.volume;
			}
		},
		/**
		 * get the native muted state
		 */
		getPlayerElementMuted: function () {
			if (this.getPlayerElement()) {
				return this.playerElement.muted;
			}
		},

		/**
		 * Get the native media duration
		 */
		getNativeDuration: function () {
			if (this.playerElement) {
				return this.playerElement.duration;
			}
		},

		/**
		 * Load the video stream with a callback fired once the video is "loaded"
		 *
		 * @parma {Function} callbcak Function called once video is loaded
		 */
		load: function (callback) {
			this.getPlayerElement();
			if (!this.playerElement) {
				// No vid loaded
				this.log('load() ... doEmbed');
				this.onlyLoadFlag = true;
				this.embedPlayerHTML();
				this.onLoadedCallback = callback;
			} else {
				// Should not happen offten
				this.playerElement.load();
				if (callback) {
					callback();
				}
			}
		},

		/**
		 * Get /update the playerElement value
		 */
		getPlayerElement: function () {
			this.playerElement = $('#' + this.pid).get(0);
			return this.playerElement;
		},

		/**
		 * Bindings for the Video Element Events
		 */

		/**
		 * Local method for seeking event
		 * fired when "seeking"
		 */
		_onseeking: function () {
			// don't handle seek event on Android native browser
			var nua = navigator.userAgent;
			var is_native_android_browser = ((nua.indexOf('Mozilla/5.0') > -1 &&
				nua.indexOf('Android ') > -1 &&
				nua.indexOf('AppleWebKit') > -1) && !(nua.indexOf('Chrome') > -1));

			if (is_native_android_browser) {
				return;
			}
			this.log("onSeeking " + this.seeking + ' new time: ' + this.getPlayerElement().currentTime);
			if (this.seeking && Math.round(this.getPlayerElement().currentTime - this.currentSeekTargetTime) > 2) {
				this.log("Error: Seek time mismatch: target:" + this.getPlayerElement().currentTime +
					' actual ' + this.currentSeekTargetTime + ', note apple HLS can only seek to 10 second targets');
			}
			// Trigger the html5 seeking event
			//( if not already set from interface )
			if (!this.seeking) {
				this.currentSeekTargetTime = this.getPlayerElement().currentTime;
				this.seeking = true;
				// Run the onSeeking interface update
				this.layoutBuilder.onSeek();

				// Trigger the html5 "seeking" trigger
				this.log("seeking:trigger:: " + this.seeking);
				if (this._propagateEvents) {
					this.triggerHelper('seeking');
				}
			}else if (this.useNativePlayerControls()) {
				//In native controls the seek event is fired every time the scrubber is moved, even if user didn't
				//finish dragging it, so update seek target on each event received
				this.currentSeekTargetTime = this.getPlayerElement().currentTime;
			}
		},
		/**
		 * Local method for seeked event
		 * fired when done seeking
		 */
		_onseeked: function () {
			this.log("onSeeked " + this.seeking + ' ct:' + this.playerElement.currentTime);

			// Trigger the html5 action on the parent
			if (this.seeking) {
				var _this = this;
				this.waitForSeekTarget().then(function(){
					_this.seeking = false;
					_this.isFlavorSwitching = false;
					if (_this._propagateEvents) {
						_this.log(" trigger: seeked");
						_this.triggerHelper('seeked', [_this.currentTime]);
					}
					_this.hideSpinner();
				});
			}
		},

		waitForSeekTarget: function(deferred, callbackCount){
			this.log("wait for seek target verification");
			var _this = this;
			var vid = this.getPlayerElement();
			var waitForSeekTargetDeferred = deferred || $.Deferred();

			// HLS safari triggers onseek when its not even close to the target time,
			// we don't want to trigger the seek event for these "fake" onseeked triggers
			if ((this.mediaElement.selectedSource.getMIMEType() === 'application/vnd.apple.mpegurl') &&
				( ( Math.abs(this.currentSeekTargetTime - this.getPlayerElement().currentTime) > 2) ||
				( this.currentSeekTargetTime > 0.01 && ( mw.isIpad() && !mw.isIOS8_9() ) ) ) ) {

				this.log( "Error: seeked triggred with time mismatch: target:" +
					this.currentSeekTargetTime + ' actual:' + this.getPlayerElement().currentTime );

				if( !callbackCount ){
					callbackCount = 0;
				}

				var canPlayBind = 'canplaythrough.nativePlayBind';
				$(vid).unbind(canPlayBind).one(canPlayBind, function () {
					if (vid.paused){
						_this.log( "seek target verified" );
						return waitForSeekTargetDeferred.resolve();
					} else {
						var timeupdateCallback = function ( callbackCount ) {
							if ( (Math.abs( _this.currentSeekTargetTime - _this.getPlayerElement().currentTime ) > 2) &&
								callbackCount <= 15 ) {
								setTimeout( function () {
									timeupdateCallback( callbackCount++ );
								}, 100 );
							} else {
								if ( callbackCount > 15 ) {
									_this.log( "Error: seek target failed" );
								} else {
									_this.log( "seek target verified" );
								}
								return waitForSeekTargetDeferred.resolve();
							}
						};

						var timeupdateBind = 'timeupdate.nativePlayBind';
						$( vid ).unbind( timeupdateBind ).one( timeupdateBind, function () {
							timeupdateCallback( 0 );
						} );
					}
				});
				return waitForSeekTargetDeferred;
			} else {
				this.log("seek target verified");
				return waitForSeekTargetDeferred.resolve();
			}
		},

		/**
		 * HLS safari triggers onseek when its not even close to the target time
		 * we don't want to trigger the seek event for these "fake" onseeked triggers
		 * @returns {boolean} true if seek event is fake, false if valid
		 */

		/**
		 * Handle the native durationchange event
		 */
		_ondurationchange: function (event, data) {
			if (this.playerElement && !isNaN(this.playerElement.duration) && isFinite(this.playerElement.duration)) {
				this.setDuration(this.getPlayerElement().duration);
			}
		},
		/**
		 * Handle the native paused event
		 */
		_onpause: function () {
			var _this = this;
			this.playing = false;
			if (this.ignoreNextNativeEvent) {
				this.ignoreNextNativeEvent = false;
				return;
			}
			var timeSincePlay = Math.abs(this.absoluteStartPlayTime - new Date().getTime());
			this.log(" OnPaused:: propagate:" + this._propagateEvents +
				' time since play: ' + timeSincePlay + ' duringSeek:' + this.seeking);
			// Only trigger parent pause if more than MonitorRate time has gone by.
			// Some browsers trigger native pause events when they "play" or after a src switch
			if (!this.seeking && !this.userSlide
				&&
				timeSincePlay > mw.getConfig('EmbedPlayer.MonitorRate')
				) {
				_this.parent_pause();
				// in iphone when we're back from the native payer we need to show the image with the play button
				if (mw.isIphone()) {
					_this.updatePosterHTML();
				}
			} else {
				// try to continue playback:
				this.getPlayerElement().play();
			}
		},

		/**
		 * Handle the native play event
		 */
		_onplay: function () {
			this.log(" OnPlay:: propogate:" + this._propagateEvents + ' paused: ' + this.paused);
			// if using native controls make sure the inteface does not block the native controls interface:
			if (this.useNativePlayerControls() && $(this).find('video ').length == 0) {
				$(this).hide();
			}

			// Update the interface ( if paused )
			if (!this.ignoreNextNativeEvent && this._propagateEvents && this.paused && ( mw.getConfig('EmbedPlayer.EnableIpadHTMLControls') === true )) {
				this.parent_play();
			} else {
				// make sure the interface reflects the current play state if not calling parent_play()
				this.playInterfaceUpdate();
				this.absoluteStartPlayTime = new Date().getTime();
			}
			// Set firstEmbedPlay state to false to avoid initial play invocation :
			this.ignoreNextNativeEvent = false;
			// re-start the monitor:
			this.monitor();
		},

		/**
		 * Local method for metadata ready
		 * fired when metadata becomes available
		 *
		 * Used to update the media duration to
		 * accurately reflect the src duration
		 */
		_onloadedmetadata: function () {
			this.getPlayerElement();

			// only update duration if we don't have one: ( some browsers give bad duration )
			// like Android 4 default browser
			if (!this.duration
				&&
				this.playerElement
				&& !isNaN(this.playerElement.duration)
				&&
				isFinite(this.playerElement.duration)
				) {
				this.log('onloadedmetadata metadata ready Update duration:' + this.playerElement.duration + ' old dur: ' + this.getDuration());
				this.setDuration(this.playerElement.duration);
			}

			// Check if in "playing" state and we are _propagateEvents events and continue to playback:
			if (!this.paused && this._propagateEvents) {
				this.getPlayerElement().play();
			}

			//Fire "onLoaded" flags if set
			if (typeof this.onLoadedCallback == 'function') {
				this.onLoadedCallback();
			}

			// Trigger "media loaded"
			if (!this.mediaLoadedFlag) {
				$(this).trigger('mediaLoaded');
				this.mediaLoadedFlag = true;
			}
		},

		/**
		 * Local method for progress event
		 * fired as the video is downloaded / buffered
		 *
		 * Used to update the bufferedPercent
		 *
		 * Note: this way of updating buffer was only supported in Firefox 3.x and
		 * not supported in Firefox 4.x
		 */
		_onprogress: function (event) {
			var e = event.originalEvent;
			if (e && e.loaded && e.total) {
				this.updateBufferStatus(e.loaded / e.total);
				this.progressEventData = e.loaded;
			}
		},

		/**
		 * Local method for end of media event
		 */
		_onended: function (event) {
			var _this = this;
			if (this.getPlayerElement()) {
				this.log('onended:' + this.playerElement.currentTime + ' real dur:' + this.getDuration() + ' ended ' + this._propagateEvents);
				if (this._propagateEvents && !this.isLive()) {
					this.onClipDone();
				}
			}

	},
		/**
		* playback error
		*/
		_onerror: function ( event ) {
			if( this.ignoreNextError ) {
				return;
			}
			var _this = this;
			// this time out is to give $( window ).unload method a chance to be called before showing page unload network errors.
			// we want to keep this value low to avoid delay in "access control" network errors.
			setTimeout(function(){
				if( _this.triggerNetworkErrorsFlag ){
					var data = [];
					if ( event && event.currentTarget && event.currentTarget.error ) {
						data[ 'errorCode' ] = event.currentTarget.error.code;
						_this.log( '_onerror: MediaError code: ' + data.errorCode);
					}
				}
			}, 100);
		},

		/**
		 * buffer under-run
		 * @private
		 */
		_onwaiting: function () {
			//vod buffer events are being handled by EmbedPlayer.js
			if (this.isLive()) {
				this.bufferStart();
			}
		},

		_oncanplay: function (event) {
			if (this.isLive() && this.buffering) {
				this.bufferEnd();
			}
		},
		/**
		 * Local onClip done function for native player.
		 */
		onClipDone: function () {
			this.parent_onClipDone();

			if (mw.isIphone() && !this.loop) {
				$(this).trigger('onEndedDone');
			}

			// Don't run onclipdone if _propagateEvents is off
			if (!this._propagateEvents) {
				return;
			}

			var _this = this;

			if (_this.isImagePlayScreen() && !_this.isPlaylistScreen()) {
				this.closeNativeFullScreen();
			}

			// add clip done binding ( will only run on sequence complete )
			$(this).unbind('onEndedDone.onClipDone').bind('onEndedDone.onClipDone', function () {
				// if not a legitmate play screen don't keep the player offscreen when playback starts:
				if (!_this.isImagePlayScreen()) {
					_this.keepPlayerOffScreenFlag = false;
				} else {
					// exit full screen mode on the iPhone
					this.closeNativeFullScreen();
				}
			});
		},

		closeNativeFullScreen: function () {
			if (!mw.getConfig("EmbedPlayer.ForceNativeFullscreenOnClipDone") && !this.keepNativeFullScreen) {
				this.log('onClipDone: Exit full screen');
				this.getPlayerElement().webkitExitFullScreen();
			}
		},
		enableNativeControls: function () {
			$(this.getPlayerElement()).attr('controls', "true");
		},

		backToLive: function () {
			this.triggerHelper('movingBackToLive');
			var vid = this.getPlayerElement();
			vid.load();
			vid.play();
		},
		isVideoSiblingEnabled: function () {
			if (mw.isIphone() || mw.isAndroid2() || mw.isWindowsPhone() || mw.isAndroid40() || mw.isMobileChrome()
				||
				( mw.isIpad() && !mw.isIpad3() )
				) {
				return false;
			} else {
				return this.parent_isVideoSiblingEnabled();
			}
		},

		playSegment: function (startTime, endTime) {
			if (this.supportsURLTimeEncoding()) {
				this.stop();
				var baseTimeOptions =  {
					'supportsURLTimeEncoding': true,
					'startTime' :this.startTime,
					'endTime': this.pauseTime
				};
				var newSource = this.mediaElement.autoSelectSource(baseTimeOptions);
				if (newSource) {
					this.switchSrc(newSource);
				}
				if (mw.isIOS8_9()){
					this.play();
				}
			} else {
				this.pause();
				this.currentTime = 0;
				this.addStartTimeCheck();
				if (this.canAutoPlay()) {
					this.play();
				}
			}
		},
		setInline: function ( state ) {
			this.getPlayerElement().attr('webkit-playsinline', '');
		}
	};
})(mediaWiki, jQuery);
