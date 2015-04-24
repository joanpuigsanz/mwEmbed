mw.PluginManager.add( 'trPlaylistServices', mw.KBasePlugin.extend({

	defaultConfig: {
		'maxResults' : 50
	},

	setup: function() {
		this.setBindings();
	},
	setBindings : function(){

		this.setConfig("ks" ,  this.getKalturaClient().ks);

		var _this = this;
		this.bind('trLoadNewPlaylist', $.proxy(function(e,params){
			_this.loadPlaylist(params);
		}));
		this.bind('mediaListLayoutReady', $.proxy(function(e,params){
		}));
		this.bind('playbackComplete', function(e){
			_this.embedPlayer.sendNotification('playNextClip' );
		});

		this.bind('playerReady', $.proxy(function(){
			//in case there is a playlisr plugin but no kpl0Url nor kpl0id - the player needs to load a related playlist
			if( typeof _this.embedPlayer.evaluate("{playlistAPI}") == 'object'
				&& _this.embedPlayer.evaluate("{playlistAPI.kpl0Url}") == undefined
				&& _this.embedPlayer.evaluate("{playlistAPI.kpl0idl}") == undefined) {
				if(_this.getConfig("loadedOnce")){
					return;
				}
				setTimeout(function(){
					_this.setConfig("loadedOnce",true);
					_this.loadRelatedPlaylist();
				},11)
			}
		},this));

		this.bind('trLoadPlaylistBySearch', $.proxy(function(e,search){
			this.loadSearchPlaylist(search)
		},this));

	},
	loadRelatedPlaylist : function (){
		var ks= this.getConfig("ks");
		var params = {
			'playlistParams': {
				'service': 'playlist',
				'action': 'execute',
				'ks': ks,
				'id': '_KDP_CTXPL',
				'filter:objectType': 'KalturaMediaEntryFilterForPlaylist',
				'filter:mediaTypeEqual': '1',
				'filter:idNotIn': this.embedPlayer.evaluate('{mediaProxy.entry.id}'), 	// dont fetch current entry
				'playlistContext:objectType': 'KalturaEntryContext',
				'playlistContext:entryId': this.embedPlayer.evaluate('{mediaProxy.entry.id}'),
				'totalResults': 50
			},
			'autoInsert': false, //if this is set to true the player will load and switch the current video to the new playlist
			//'initItemEntryId' : '1_cvsg4ghm', // player start playing a specific entry if exist
			'playlistName': 'new playlist' // override the displayed playlist name
		}
		this.embedPlayer.sendNotification('loadExternalPlaylist', params );
	},

	loadSearchPlaylist : function (search){
		var ks= this.getConfig("ks");
		var params = {
			"playlistParams" : {
				"service":"playlist" ,
				"action":"executefromfilters" ,
				'ks' : ks,
				'filters:item0:freeText' : search ,
				'filters:item0:idNotIn' : this.embedPlayer.evaluate('{mediaProxy.entry.id}') , 	// don't fetch current entry
				"totalResults" : this.getConfig("maxResults")
			},
			'autoInsert' : false,
			'playlistName' : "new name"
		}
		this.embedPlayer.sendNotification('loadExternalPlaylist', params );
	},
	loadPlaylist : function (params){
		if(!params.ks){
			params.ks = this.getConfig("ks")
		}
		this.embedPlayer.sendNotification('loadExternalPlaylist', params );
	}


}));