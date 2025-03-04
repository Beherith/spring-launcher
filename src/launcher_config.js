'use strict';

const log = require('electron-log');

const argv = require('./launcher_args');
const { resolveWritePath } = require('./write_path');
const path = require('path');
const fs = require('fs');

const defaultSetup = {
	'package': {
		// Possible values are 'darwin', 'linux', 'win32'
		'platform': 'all',
		'portable': false,
		'display': 'Spring Launcher'
	},

	'isolation': true,
	'auto_download': false,
	'auto_start': false,
	'no_downloads': false,
	'no_start_script': false,
	'load_dev_exts': false,
	'route_prd_to_nextgen': false,
	'github_log_repo': null,
	'config_url': null,
	'silent': true,

	'downloads': {
		'games': [],
		'maps': [],
		'engines': [],
		'resources': [],
		'nextgen': [],
	},

	'launch': {
		'start_args': [],
		'game': undefined,
		'map': undefined,
		'engine': undefined,
		'map_options': undefined,
		'mod_options': undefined,
		'game_options': undefined
	}
};

function canUse(config) {
	if (config.package.platform != 'all') {
		if (config.package.platform != process.platform) {
			return false;
		}
	}
	if (config.package.portable && !process.env.PORTABLE_EXECUTABLE_DIR) {
		return false;
	}
	if (process.env.PORTABLE_EXECUTABLE_DIR && !config.package.portable) {
		return false;
	}
	return true;
}

/**
 * Simple object check.
 * @param item
 * @returns {boolean}
 */
function isObject(item) {
	return (item && typeof item === 'object' && !Array.isArray(item));
}

/**
 * Deep merge two objects.
 * @param target
 * @param ...sources
 */
function mergeDeep(target, ...sources) {
	if (sources.length === 0) {
		return target;
	}
	const source = sources.shift();

	if (isObject(target) && isObject(source)) {
		for (const key in source) {
			if (isObject(source[key])) {
				if (!target[key]) {
					Object.assign(target, { [key]: {} });
				}
				mergeDeep(target[key], source[key]);
			} else {
				Object.assign(target, { [key]: source[key] });
			}
		}
	}

	return mergeDeep(target, ...sources);
}

function loadConfig(filePath) {
	// 1. Load config file that comes with the application
	const conf = require(filePath);

	// 2. If there's a config.json file use that instead
	//    but if that fails to parse just ignore it and use the application one
	try {
		const writePath = resolveWritePath(conf.title);
		const configFile = path.join(writePath, 'config.json');
		if (!fs.existsSync(configFile)) {
			return conf;
		}

		console.log(`Loading Config file: ${configFile}`);
		return JSON.parse(fs.readFileSync(configFile));
	} catch (err) {
		// TODO: Perhaps too early to log at this point? We'll use console instead
		console.error('Cannot load local config.json. Falling back to default one.');
		console.error(err);
		return conf;
	}
}

function applyDefaults(conf) {
	for (let i = 0; i < conf.setups.length; i++) {
		const defaultSetupCopy = JSON.parse(JSON.stringify(defaultSetup));
		const setup = mergeDeep(defaultSetupCopy, conf.setups[i]);
		setup.title = conf.title;
		conf.setups[i] = setup;
	}
	return conf;
}

let configs = [];
let availableConfigs = [];
let currentConfig = null;
function reloadConfig(conf) {
	configs = [];
	availableConfigs = [];
	currentConfig = null;

	conf.setups.forEach((setup) => {
		configs.push(setup);

		if (canUse(setup)) {
			availableConfigs.push(setup);
			if (!currentConfig) {
				currentConfig = setup;
			}
		}
	});

	return conf;
}

let configFile = loadConfig(argv.config != null ? argv.config : './config.json');
configFile = applyDefaults(configFile);
reloadConfig(configFile);

function isSameAsCurrent(newFile) {
	return JSON.stringify(newFile) == JSON.stringify(configFile);
}

const proxy = new Proxy({
	setConfig: function (id) {
		var found = false;
		availableConfigs.forEach((cfg) => {
			if (cfg.package.id == id) {
				currentConfig = cfg;
				found = true;
			}
		});
		if (!found) {
			log.error(`No config with ID: ${id} - ignoring`);
			return false;
		} else {
			return true;
		}
	},
	getAvailableConfigs: function () {
		return availableConfigs;
	},
	getConfigObj: function () {
		return currentConfig;
	}
}, {
	get: function (target, name) {
		if (target[name] != undefined) {
			return target[name];
		} else if (configFile[name] != undefined) {
			return configFile[name];
		}

		return currentConfig[name];
	},
	set: function (_, name, value) {
		currentConfig[name] = value;
		return true;
	}
});

module.exports = {
	config: proxy,
	applyDefaults: applyDefaults,
	isSameAsCurrent: isSameAsCurrent,
};
