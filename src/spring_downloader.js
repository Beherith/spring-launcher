'use strict';

const EventEmitter = require('events');

const log = require('electron-log');

const prdDownloader = require('./prd_downloader');
const httpDownloader = require('./http_downloader');
const { NextGenDownloader } = require('./nextgen_downloader');
const nextGenDownloader = new NextGenDownloader();

function getDownloader(name) {
	let url;
	try {
		url = new URL(name);
	} catch (_) {
		return prdDownloader;
	}

	if (url.protocol === 'http:' || url.protocol === 'https:') {
		return httpDownloader;
	} else {
		return prdDownloader;
	}
}

let currentDownloader = null;

class SpringDownloader extends EventEmitter {
	constructor() {
		super();

		let downloaders = [prdDownloader, httpDownloader, nextGenDownloader];
		for (const downloader of downloaders) {
			downloader.on('started', (downloadItem, type, args) => {
				this.emit('started', downloadItem, type, args);
			});

			downloader.on('progress', (downloadItem, current, total) => {
				this.emit('progress', downloadItem, current, total);
			});

			downloader.on('finished', (downloadItem) => {
				currentDownloader = null;
				this.emit('finished', downloadItem);
			});

			downloader.on('failed', (downloadItem, msg) => {
				currentDownloader = null;
				this.emit('failed', downloadItem, msg);
			});

			downloader.on('aborted', (downloadItem, msg) => {
				currentDownloader = null;
				this.emit('aborted', downloadItem, msg);
			});
		}
	}

	downloadEngine(engineName) {
		prdDownloader.downloadEngine(engineName);
		currentDownloader = prdDownloader;
	}

	downloadGame(gameName) {
		prdDownloader.downloadGame(gameName);
		currentDownloader = prdDownloader;
	}

	downloadMap(mapName) {
		prdDownloader.downloadMap(mapName);
		currentDownloader = prdDownloader;
	}

	downloadResource(resource) {
		const downloader = getDownloader(resource['url']);
		downloader.downloadResource(resource);
		currentDownloader = downloader;
	}

	downloadNextGen(resource) {
		nextGenDownloader.download(resource);
		currentDownloader = nextGenDownloader;
	}

	stopDownload() {
		if (currentDownloader == null) {
			log.error('No current download. Nothing to stop');
			return;
		}

		currentDownloader.stopDownload();
	}
}

module.exports = new SpringDownloader();
