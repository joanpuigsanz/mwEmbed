/*
 * The "kaltura player" embedPlayer interface for fallback h.264 and flv video format support
 * See http://www.mediawiki.org/wiki/Manual:Coding_conventions/JavaScript for formating conventions
 */
( function( mw, $ ){ "use strict";

	window['mwePlayerId'];
	mw.EmbedPlayerYouTube = {

		//test comment for testing pull request

		// Instance name:
		instanceOf : 'YouTube',

		bindPostfix: '.YouTube',

		playerPrefix: 'EmbedPlayerYouTube',

		//current playhead time
		time : 0,
		//current entry duration
		duration : 0,
		// A flag to store if the player has already been embed or not
		playerEmbedFlag: false,
		//Flag holdinng end state
		hasEnded: false,
		ytMobilePlayed: false,
		//the youtube entry id
		youtubeEntryId : "",
		playerReady: null,
		isPlaylist: false,
		//the youtube preFix
		//TODO grab from a configuration
		youtubePreFix : "//www.youtube.com/apiplayer?video_id=",
		youtubeProtocol : "http:",
		// List of supported features:
		supports : {
			'playHead' :  (mw.getConfig('previewMode') == null) ? true : false ,
			'pause' : true,
			'stop' : true,
			'timeDisplay' : true,
			'volumeControl' : true,
			'overlays' : true,
			'fullscreen' : (mw.getConfig('previewMode') == null) ? true : false
		},
		init: function(){
			this._playContorls = false;
			this.playerReady = $.Deferred();
		},

		onPlayerStateChange : function (event){
			//delegate to window function
			window['onPlayerStateChange'](event);
		},

		registerGlobalCallbacks: function(){
			var _this = this;
			window['onPlayerStateChange'] = function( event ){
				var _this = $('#' + window['mwePlayerId'])[0];
				// clean up
				if( event.data || event.data == 0 || event.data ){
					event = event.data;
				}
				var stateName;
				var embedPlayer = $('#' + window["pid"].replace( 'pid_', '' ) )[0];

				// enable controls (if disabled on mobile devices)
				if (mw.isMobileDevice()){
					_this._playContorls = true;
					$( _this ).trigger( 'onEnableInterfaceComponents', []);
				}

				// move to other method
				switch( event ){
					case -1:
						stateName = "unstarted";
						break;
					case 0:
						stateName = "ended";
						_this.hasEnded = true;
						break;
					case 1:
						_this.ytMobilePlayed = true;
						if (_this.hasEnded){
							_this.hasEnded = false;
							return;
						}
						$(embedPlayer).trigger("onPlayerStateChange",["play"]);
						// hide the player container so that youtube click through work
						$(".mwEmbedPlayer").width("100%");
						$('.mwEmbedPlayer').hide();
						//hide the poster
						$(".playerPoster").hide();
						$('.blackBoxHide').hide();
						_this.play();
						stateName = "playing";
						// update duraiton
						_this.setDuration();
						// trigger the seeked event only if this is seek and not in play
						if(_this.seeking){
							_this.seeking = false;
							$( _this ).trigger( 'seeked' );
							// update the playhead status
							_this.updatePlayheadStatus();
						}
						break;
					case 2:
						if (mw.isMobileDevice()){
							$(".largePlayBtn").hide();
						}
						stateName = "paused";
						$(embedPlayer).trigger("onPlayerStateChange",["pause"]);
						_this.parent_pause();
						break;
					case 3:
						stateName = "buffering";
						break;
					case 4:
						stateName = "unbuffering";
						break;
					case 5:
						stateName = "video cued";
						break;
				}
				//$( _this ).trigger( 'onPlayerStateChange', [ stateName ] );

			};
			window['hidePlayer'] = function( event ){

			}
			window['onError'] = function( event ){
				mw.log("Error! YouTubePlayer" ,2);
				//$('#loadingSpinner_kaltura_player').append('<br/>Error!');
				var errorMessage;
				if (event.data)
					event = event.data;
				switch( event ){
					case 2:
						errorMessage = "The request contains an invalid parameter value.";
						break;
					case 0:
					case 100:
						errorMessage = "The video requested was not found";
						break;
					case 101:
					case 150:
						errorMessage = "The owner of the requested video does not allow it to be played in embedded players";
						break;
				}
				//$('#loadingSpinner_kaltura_player').append('<br/>'+errorMessage);
				$(".playerPoster").hide();
				//$(".loadingSpinner_kaltura_player").hide();
				if( !window['iframePlayer'] )
					$('.mwEmbedPlayer').append('<br/><br/>'+errorMessage);
				$("#loadingSpinner_kaltura_player").hide();
				mw.log(errorMessage ,2);
			};
			//YOUTUBE IFRAME PLAYER READY (Not the Iframe - the player itself)
			window['onIframePlayerReady'] = function( event ){
				window['iframePlayer'] = event.target;
				_this.setDuration();
				_this._playContorls = true;
				_this.playerReady.resolve();
				//autoMute
				if(mw.getConfig('autoMute')){
					_this.setVolume(0);
				}
				//autoplay
				if(mw.getConfig('autoPlay') && _this.canAutoPlay()){
					_this.play();
				}else{
					window['hidePlayer']();
				}

				if (mw.isMobileDevice()){
					$(".largePlayBtn").hide();
					$(".mwEmbedPlayer").hide();
					_this.hideSpinner();
					setTimeout(function(){ // issue another hideSpinner call after 250 ms for slow devices (FEC-1898)
						_this.hideSpinner();
					},250);
				}
				mw.log("EmbedPlayerYouTube:: Trigger: playerReady for HTML5 player");
				$(_this).trigger('playerReady');
			};
			// YOUTUBE FLASH PLAYER READY
			window['onYouTubePlayerReady'] = function( playerIdStr ){
				$('.ui-icon-image').hide();
				$('.timed-text').hide();
				$('.ui-icon-arrowthickstop-1-s').hide();
				$('.ui-icon-flag').hide();
				var flashPlayer = $( '#' + playerIdStr )[0];
				flashPlayer.addEventListener("onStateChange", "onPlayerStateChange");
				flashPlayer.addEventListener("onError", "onError");
				_this._playContorls = true;
				//autoMute
				if(mw.getConfig('autoMute')){
					_this.setVolume(0);
				}
				//autoplay
				if(mw.getConfig('autoPlay')){
					_this.play();
				}else{
					window['hidePlayer']();
				}
				mw.log("EmbedPlayerYouTube:: Trigger: playerReady for Flash player");
				$(_this).trigger('playerReady');
			};
			// YOUTUBE IFRAME READY
			window['onYouTubeIframeAPIReady'] = function( playerIdStr ){
				//move to the other scope
				$('.ui-icon-image').hide();
				$('.timed-text').hide();
				$('.ui-icon-arrowthickstop-1-s').hide();
				$('.ui-icon-flag').hide();
				var embedPlayer = $('#' + window["pid"].replace( 'pid_', '' ) )[0];
				_this.isPlaylist = embedPlayer.playlist;
				var playerVars;
				//basic configuration
				playerVars = {
					controls: 0,
					iv_load_policy:3,
					rel: 0,
					fs: 0,
					wmode: 'opaque',
					showinfo:0
				};

				if(window['KeyValueParams'])
				{
					var kevarsArray = window['KeyValueParams'].split("&");
					for(var i=0;i<kevarsArray.length;i++){
						var kv = kevarsArray[i].split("=");
						playerVars[kv[0]] = kv[1];
					}

				}
				embedPlayer.playerElement = new YT.Player(pid,
					{
						height: '100%',
						width: '100%',
						videoId: window["youtubeEntryId"],
						playerVars: playerVars,
						events: {
							'onReady': onIframePlayerReady,
							'onError': onError,
							'onStateChange': onPlayerStateChange
						}
					});
			};
		},

		/*
		 * Write the Embed html to the target
		 */
		embedPlayerHTML : function(){
			try {
				this.registerGlobalCallbacks();
				if ( this.playerEmbedFlag ) {
					return;
				}
				window['mwePlayerId'] = this.id;
				//handle fetching the youtubeId
				var metadata = this.evaluate( '{mediaProxy.entryMetadata}' );
				var entry = this.evaluate( '{mediaProxy.entry}' );
				//look for referenceId and then for custom data field YoutubeId
				if ( entry.referenceId )
					this.youtubeEntryId = entry.referenceId;
				if ( metadata.YoutubeId )
					this.youtubeEntryId = metadata.YoutubeId;

				if ( this.youtubeEntryId.indexOf( 'http' ) > -1 || this.youtubeEntryId.indexOf( 'youtube' ) > -1 ) {
					//found a full path - parse the entryId from it:
					var arr = this.youtubeEntryId.split( "v=" );
					var newEntryId = arr[1];
					if ( newEntryId.indexOf( "#" ) > -1 )
						newEntryId = newEntryId.split( "#" )[0];
					if ( newEntryId.indexOf( "&" ) > -1 )
						newEntryId = newEntryId.split( "&" )[0];
					this.youtubeEntryId = newEntryId;
				}
			}
			catch(e){
				mw.log('Error occur while trying to extract youtube entry',e);
				this.showWrongReferenceIdMessege();
				return;

			}
			this.addBindings();

			if(metadata.KeyValueParams){
				window['KeyValueParams'] = metadata.KeyValueParams;
			}
			window['pid'] = this.pid;

			if(mw.getConfig("forceYoutubeEntry"))
			{
				this.youtubeEntryId=mw.getConfig("forceYoutubeEntry");
			}
			window["youtubeEntryId"] = this.youtubeEntryId;


			this.playerEmbedFlag = true;
			this.youtubeProtocol = location.protocol;
			this.youtubePreFix = this.youtubeProtocol+this.youtubePreFix;

			if( this.supportsFlash() && mw.getConfig("forceIframe") == 0 ){
				// embed chromeless flash
				if(window['KeyValueParams']){
					var dataUrl = this.youtubePreFix + this.youtubeEntryId +'&amp;showinfo=0&amp;version=3&ampiv_load_policy=3&amp;' +
						'enablejsapi=1&amp;playerapiid=' + this.pid +
						"&amp&" + window['KeyValueParams'];
				}else{
					var dataUrl = this.youtubePreFix + this.youtubeEntryId +'&amp;showinfo=0&amp;version=3&ampiv_load_policy=3&amp;' +
						'enablejsapi=1&amp;playerapiid=' + this.pid ;
				}

				var classId = "";
				if( window.ActiveXObject ){
					classId= ' classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000" ';
				}

				var embedStr = 	'<object type="application/x-shockwave-flash" '+
					'id="' + this.pid + '" ' +
					'name="' + this.pid + '" ' + classId +
					'AllowScriptAccess="always" ' +
					'data="' + dataUrl + '" ' +
					'width="100%" height="100%">' +
					'<param name="movie" value="' + dataUrl+  '">' +
					'<param name="allowScriptAccess" value="always">' +
					'<param name="wmode" value="opaque">' +
					'<param name="bgcolor" value="#000000">' +
					'</object>';

				$('.persistentNativePlayer').replaceWith(embedStr);
			} else {
				// embed iframe ( native skin in iOS )
				$('.videoHolder').append('<div id="'+this.pid+'"></div>');
				var tag = document.createElement('script');
				tag.src = "//www.youtube.com/iframe_api";
				tag.id = "youTubeLib";
				var firstScriptTag = document.getElementsByTagName('script')[0];
				firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
			}
		},
		setDuration: function(){
			//set duration only if current duration is 0 or different from the video duration. on Android native browser sometimes we get duration=1 so working around that here...
			var dur = this.getPlayerElement().getDuration();
			if (dur && dur != 1 && (this.duration == 0 || (this.duration > 0 && this.duration != dur)) ){
				this.duration = this.getPlayerElement().getDuration();
				$(this).trigger('durationChange',[this.duration]);
			}
		},
		onPlayerReady : function (event){

		},
		addBindings: function(){
			var _this = this;
			mw.log("addBindings" , 5);

			this.bindHelper ('layoutBuildDone' + this.bindPostfix , function(){
				if (mw.isMobileDevice()){
					$(".largePlayBtn").css("opacity",0);
					$(".mwEmbedPlayer").width(0);
				}
			});

			this.bindHelper ('onChangeMedia' + this.bindPostfix , function(){
				if (mw.isMobileDevice()){
					$(".largePlayBtn").css("opacity",1);
					$(".mwEmbedPlayer").width("100%");
					$( _this ).trigger( 'onEnableInterfaceComponents', []);
				}
				if (_this.referenceId){
					_this.getPlayerElement().loadVideoById(_this.referenceId);
				}
			});

			this.bindHelper ('playerReady' + this.bindPostfix , function(){
				$('.playerPoster').before('<div class="blackBoxHide" style="width:100%;height:100%;background:black;position:absolute;"></div>');
				if (!_this.canAutoPlay()){
					_this._playContorls = false;
					$( _this ).trigger( 'onDisableInterfaceComponents', [["playlistAPI"]] );
				}
			});

			this.bindHelper("onEndedDone" + this.bindPostfix, function(){
				// restore the black cover after layout update is done (it is removed by updatePosterHTML in EmbedPlayer.js)
				setTimeout(function(){
					$('.playerPoster').before('<div class="blackBoxHide" style="width:100%;height:100%;background:black;position:absolute;"></div>');
				},100);
				if (mw.isMobileDevice() && mw.isIpad()){
					_this.getPlayerElement().stopVideo();
					_this.getPlayerElement().pauseVideo();
					_this.getPlayerElement().seekTo(0);
				}else{
					_this.getPlayerElement().seekTo(0);  // fix for a bug in replay (loop)
					setTimeout(function(){
						$(_this).trigger("onPlayerStateChange",["end"]); // this will trigger the replay button to appear
						_this.pause();
					},200);
				}

			})
		},
		changeMediaCallback: function (callback) {
			var _this = this;
			if (mw.isMobileDevice()){
				$(".largePlayBtn").css("opacity",0);
				$(".mwEmbedPlayer").width(0);
			}
			this.playerReady.promise().then(function(){
				callback();
				if( mw.getConfig('autoPlay') || _this.isPlaylist){
					if (mw.isMobileDevice()){
						if (mw.isIphone()){
							$(".largePlayBtn").hide();
							setTimeout(function(){
								_this.hideSpinner();
							},350);
						}
						if (_this.ytMobilePlayed){
							_this.play();
						}else{
							_this.getPlayerElement().stopVideo();
							_this._playContorls = false;
							$( _this ).trigger( 'onDisableInterfaceComponents', [["playlistAPI"]] );
						}
					}else{
				        _this.play();
					}
				}
			});
		},
		canAutoPlay: function(){
			return !mw.isMobileDevice() || (mw.isMobileDevice() && this.ytMobilePlayed);
		},
		getKClient: function () {
			if (!this.kClient) {
				this.kClient = mw.kApiGetPartnerClient(this.kwidgetid);
			}
			return this.kClient;
		},
		supportsVolumeControl: function(){
			// if ipad no.
			return true;
		},
		getYouTubeId: function(){
			return this.getSrc().split('?')[1];
		},
		/**
		 * If the browser supports flash
		 * @return {boolean} true or false if flash > 10 is supported.
		 */
		supportsFlash: function(){
			if( mw.getConfig('EmbedPlayer.DisableHTML5FlashFallback' ) ){
				return false;
			}
			var version = this.getFlashVersion().split(',').shift();
			if( version < 10 ){
				return false;
			} else {
				return true;
			}
		},
		/**
		 * Checks for flash version
		 * @return {string} flash version string
		 */
		getFlashVersion: function(){
			// navigator browsers:
			if (navigator.plugins && navigator.plugins.length){
				try {
					if(navigator.mimeTypes["application/x-shockwave-flash"].enabledPlugin){
						return (navigator.plugins["Shockwave Flash 2.0"] || navigator.plugins["Shockwave Flash"]).description.replace(/\D+/g, ",").match(/^,?(.+),?$/)[1];
					}
				} catch(e){}
			}
			// IE
			try {
				try {
					if( typeof ActiveXObject != 'undefined' ){
						// avoid fp6 minor version lookup issues
						// see: http://blog.deconcept.com/2006/01/11/getvariable-setvariable-crash-internet-explorer-flash-6/
						var axo = new ActiveXObject('ShockwaveFlash.ShockwaveFlash.6');
						try {
							axo.AllowScriptAccess = 'always';
						} catch(e){
							return '6,0,0';
						}
					}
				} catch(e){}
				return new ActiveXObject('ShockwaveFlash.ShockwaveFlash').GetVariable('$version').replace(/\D+/g, ',').match(/^,?(.+),?$/)[1];
			} catch(e){}
			return '0,0,0';
		},
		/**
		 * javascript run post player embedding
		 */
		postEmbedActions : function(){
		},

		/**
		 * Bind a Player Function,
		 *
		 * Build a global callback to bind to "this" player instance:
		 *
		 * @param {String}
		 *			flash binding name
		 * @param {String}
		 *			function callback name
		 */
		bindPlayerFunction : function(bindName, methodName){
		},

		/**
		 * play method calls parent_play to update the interface
		 */
		play: function(){
			var _this = this;
			if(this._playContorls) {
				if (this.hasEnded) {
					if (mw.isMobileDevice()) {
						$(".largePlayBtn").hide();
						$(".mwEmbedPlayer").hide();
					}
				}
				if (this.parent_play()) {
					if (_this.getPlayerElement()) {
						_this.getPlayerElement().playVideo();
					}
				}
				this.monitor();
			}
		},

		monitor: function(){
			this.parent_monitor();
			$( this ).trigger( 'timeupdate' );
		},

		/**
		 * pause method calls parent_pause to update the interface
		 */
		pause: function(){
			var yt = this.getPlayerElement();
			yt.pauseVideo();
			this.parent_pause();
		},
		/**
		 * clean method cleans the player when switching to another player: remove iframe, kill player, remove script tags from document head
		 */
		clean: function(){
			$('.blackBoxHide').hide();
			this.getPlayerElement().destroy(); // remove iframe
			if (typeof YT !== 'undefined'){
				YT = null; // kill player
			}
			this.unbindHelper( this.bindPostfix ); // remove bindings
			// remove scripts from head
			$("#youTubeLib").remove();
			$("#www-widgetapi-script").remove();
		},

		/**
		 * playerSwitchSource switches the player source working around a few bugs in browsers
		 *
		 * @param {object}
		 *			source Video Source object to switch to.
		 * @param {function}
		 *			switchCallback Function to call once the source has been switched
		 * @param {function}
		 *			doneCallback Function to call once the clip has completed playback
		 */
		playerSwitchSource: function( source, switchCallback, doneCallback ){

		},

		/**
		 * Issues a seek to the playerElement
		 *
		 * @param {Float}
		 *			percentage Percentage of total stream length to seek to
		 */
		seek : function( seekTime ){
			mw.log("Seeking to: " + seekTime);
			var _this = this;
			this.seeking = true;
			this.stopSeekWatchDog();
			$( this ).trigger( 'seeking' );
			var yt = this.getPlayerElement();
			var currentTime = this.getPlayerElementTime();
			yt.seekTo( seekTime );
			this.layoutBuilder.onSeek();
			// Since Youtube don't have a seeked event , we must turn off the seeking flag and restore pause state if needed
			if ( !this.isPlaying() ){
				setTimeout(function(){
					$( _this ).trigger( 'seeked' );
					_this.seeking = false;
					_this.pause();
				},500);
			} else {
				this.startSeekWatchDog(currentTime);
			}
		},
		startSeekWatchDog: function(refTime){
			this.log("startSeekWatchDog");
			var interval = 1000;
			var lastTime = refTime;
			var _this = this;
			var yt = this.getPlayerElement();
			this.checkPlayerTime = function () {
				if(yt.getPlayerState() == YT.PlayerState.PLAYING ) {
					var t = yt.getCurrentTime();
					///expecting 1 second interval , with 500 ms margin
					if (Math.abs(t - lastTime - 1) > 0.5) {
						// if seek threshold was detected and we're still in seeking state fire event
						if(_this.seeking) {
							$(_this).trigger('seeked');
							_this.seeking = false;
						}
						_this.stopSeekWatchDog();
						return;
					}
				}
				lastTime = yt.getCurrentTime();
				_this.watchDogTimer = setTimeout(_this.checkPlayerTime, interval); /// repeat function call in 1 second
			};
			this.watchDogTimer = setTimeout(this.checkPlayerTime, interval);
		},
		stopSeekWatchDog: function(){
			this.log("stopSeekWatchDog");
			if (this.watchDogTimer){
				clearTimeout(this.watchDogTimer);
				this.watchDogTimer = null;
			}
		},

		/**
		 * Issues a volume update to the playerElement
		 *
		 * @param {Float}
		 *			percentage Percentage to update volume to
		 */
		setPlayerElementVolume : function(percentage){
//		if ( this.getPlayerElement() && this.playerElement.sendNotification ){
//			this.playerElement.sendNotification('changeVolume', percentage);
//		}
			var _this = this;
			this.playerReady.promise().then(function(){
				var yt = _this.getPlayerElement();
				if(yt.setVolume) {
					yt.setVolume(percentage * 100);
				}
			});
		},

		/**
		 * function called by flash at set interval to update the playhead.
		 */
		onUpdatePlayhead : function( playheadValue ){
			this.time = playheadValue;
		},

		/**
		 * function called by flash when the total media size changes
		 */
		onBytesTotalChange : function(data, id){
			this.bytesTotal = data.newValue;
		},
		/**
		 * Get the embed player time
		 */
		getPlayerElementTime : function(){
			return this.getPlayerElement().getCurrentTime();
		},

		/**
		 * Get the embed fla object player Element
		 */
		getPlayerElement : function(){

			//IFRAME
			if( window['iframePlayer'] )
				return  window['iframePlayer']
			//Flash
			return $('#' + this.pid)[0];
		}
	};

} )( mediaWiki, jQuery );
