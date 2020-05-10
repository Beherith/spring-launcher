'use strict';

const EventEmitter = require('events');
const { app, ipcMain } = require('electron');

const log = require('electron-log');

const { config } = require('./launcher_config');
const { gui } = require('./launcher_gui');
const updater = require('./updater');
const springDownloader = require('./spring_downloader');
const launcher = require('./engine_launcher');

const path = require('path');
const springPlatform = require('./spring_platform');

let mainWindow;
app.on('ready', () => {
	if (!gui) {
		return;
	}
	mainWindow = gui.getMainWindow();
});

class Wizard extends EventEmitter {
	constructor() {
		super();
		this.enabled = true;
		this.generateSteps();
	}

	generateSteps() {
		var steps = [];
		if (!config.no_downloads) {
			steps.push({
				name: 'launcher_update',
				action: () => {
					const isDev = require('electron-is-dev');
					log.info('Checking for launcher update');
					if (!isDev) {
						updater.checkForUpdates();
					} else {
						console.log('Development version: no self-update required');
						setTimeout(() => {
							this.nextStep();
						}, 300);
					}
				}
			});

			config.downloads.engines.forEach((engine) => {
				steps.push({
					name: 'engine',
					item: engine,
					action: () => {
						springDownloader.downloadEngine(engine);
					}
				});
			});

			config.downloads.games.forEach((game) => {
				steps.push({
					name: 'game',
					item: game,
					action: () => {
						springDownloader.downloadGame(game);
					}
				});
			});

			config.downloads.maps.forEach((map) => {
				steps.push({
					name: 'map',
					item: map,
					action: () => {
						springDownloader.downloadMap(map);
					}
				});
			});
		}

		steps.push({
			name: 'start',
			action: (step) => {
				setTimeout(() => {
					if (launcher.state != 'failed') {
						mainWindow.hide();
					}
				}, 1000);

				let enginePath;
				if (config.launch.engine_path != null) {
					enginePath = config.launch.engine_path;
				} else {
					const engineName = config.launch.engine || config.downloads.engines[0];
					enginePath = path.join(springPlatform.writePath, 'engine', engineName, springPlatform.springBin);
				}

				log.info(`Starting Spring from: ${enginePath}`);
				launcher.launch(enginePath, config.launch.start_args);

				this.emit('launched');

				gui.send('launch-started');
				launcher.once('finished', () => {
					this.steps.push(step);
				});

				launcher.once('failed', () => {
					this.steps.push(step);
				});
			}
		});

		this.started = false;
		this.steps = steps;
	}

	setEnabled(enabled) {
		this.enabled = enabled;
	}

	nextStep(forced) {
		if (!this.enabled) {
			return;
		}

		const step = this.steps.shift();
		if (step === undefined) {
			log.warn('No more steps to do.');
			gui.send('wizard-stopped');
			gui.send('wizard-finished');
			this.started = false;
			return false;
		}
		if (!this.started) {
			gui.send('wizard-started');
			this.started = true;
		}

		log.info(`Step: ${JSON.stringify(step, null, 4)}`);

		if (step.name != 'start') {
			gui.send('wizard-next-step', {
				name: step.name,
				item: step.item
			});
		} else {
			if (!(config.auto_start || forced)) {
				gui.send('wizard-stopped');
				gui.send('wizard-finished');
				this.steps.push(step);
				return false;
			}
		}

		step.action(step);
		return true;
	}
}

ipcMain.on('wizard-next', () => {
	wizard.nextStep(true);
});


const wizard = new Wizard();

module.exports = {
	wizard: wizard,
};
