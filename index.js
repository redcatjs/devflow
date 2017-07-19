const path = require('path');
const fs = require('fs');
const { spawn, execSync, exec } = require('child_process');
const chalk = require('chalk');
const http = require('http');
const hashFiles = require('hash-files');

process.NODE_ENV = 'developement';

class devflow {
	
	constructor(options){
		options = options || {};
		this.options = {
			srcPath: 'app',
			buildPath: 'app.build',
			distPath: 'app.dist',
			serverScript: 'app.build/server.js',
			serverPort: 3000,
		};
		Object.keys(options).forEach(function(k){
			this.options[k] = options[k];
		});
		this.nodeOnline = false;
		this.liveReloadPaths = [];
	}
	
	log(...params){
		params.forEach(function(param){
			console.log( chalk.cyan(param) );
		});
	}
	
	waitForNodeOnline(){
		if(this.waitForNodeOnlineReq){
			return;
		}
		let done;
		this.waitForNodeOnlineReq = http.get({
			host: 'localhost',
			path: '',
			port: this.options.serverPort,
		}, function(res) {
			done = true;
			this.waitForNodeOnlineReq = false;
			if(res.statusCode==200){
				this.nodeOnline = true;
				this.log('node server online');
			}
			else{
				setTimeout(function(){
					this.waitForNodeOnline();
				}.bind(this),300);
			}
		}.bind(this))
			.on('error',function(){
				setTimeout(function(){
					this.waitForNodeOnline();
				}.bind(this),300);
			}.bind(this))
		;
		setTimeout(function(){
			if(!done){
				this.waitForNodeOnlineReq.abort();
				this.waitForNodeOnlineReq = false;
				this.waitForNodeOnline();
			}
		}.bind(this),300);
	}
	
	run(){
		this.runBabel();
		this.runNodemon();
		this.runLivereload();
		this.runWebpack();
	}
	
	runBabel(){
		this.log('babel - compilation');
		let babelBin = path.resolve('node_modules/babel-cli/bin/babel.js');
		let args = [ this.options.srcPath, '-d',this.options.buildPath, '--copy-files', '--source-maps inline' ];
		execSync(babelBin+' '+args.join(' '), { stdio: 'inherit' });
		
		this.log('babel - start watcher');
		spawn( babelBin, [...args, '--watch','--skip-initial-build'], {
			stdio: 'inherit'
		} );
		
	}

	runNodemon(){
		this.log('nodemon - start');
		const nodemon = require('nodemon')({
			watch: [ this.options.buildPath ],
			script: this.options.serverScript,
			env: Object.assign({},process.env,{
				NODE_PATH: this.options.buildPath
			}),
		});
		nodemon.on('restart',function(){
			this.log("nodemon restart \n");
			this.nodeOnline = false;
		}.bind(this));
		nodemon.on('start',function(){
			this.waitForNodeOnline();
		}.bind(this));
	}

	runLivereload(){
		this.log('livereload - start server');
		const livereload = require('livereload').createServer({
			applyCSSLive: true,
			applyImgLive: true,
		});
		
		const chokidar = require('chokidar');
		let reloader;
		let hashMap = {};
		let reload = function(path){
			this.liveReloadPaths.push(path);
			if(reloader){
				clearInterval(reloader);
			}
			reloader = setInterval(function(){
				if(this.nodeOnline){
					clearInterval(reloader);
					
					this.log('send livereload to browser');
					while(this.liveReloadPaths.length){
						let path = this.liveReloadPaths.shift();
						livereload.filterRefresh( path );
					}
				}
			}.bind(this),100);
		}.bind(this);
		chokidar.watch([ path.resolve(this.options.distPath) ], {
			ignoreInitial: true,
			usePolling: false,
			awaitWriteFinish: true,
		})
			.on('add', reload)
			.on('unlink', reload)
			.on('change', function(path){
				hashFiles({files:[path]}, function(error, hash) {
					if(!hashMap[path]||hashMap[path]!=hash){
						hashMap[path] = hash;
						reload(path);
					}
				});
			})
		;
	}
	
	runWebpack(){
		
		this.log('webpack - compilation + start watcher');
		
		this.runWebpackCLI();
		//this.runWebpackNode();
		
	}
	
	runWebpackCLI(){
		spawn( path.resolve('node_modules/webpack/bin/webpack.js'), ['--watch'], {
			stdio: 'inherit',
		} );
	}
	runWebpackNode(){
		const webpack = require('webpack');
		let config = require(path.resolve('webpack.config.js'));
		
		let lastHash;
		let outputOptions = { colors: { level: 2, hasBasic: true, has256: true, has16m: false } };
		
		config.watch = true;
		
		webpack(config, function(err, stats) {
			if(err) {
				lastHash = null;
				console.error(err.stack || err);
				if(err.details) console.error(err.details);
				process.exit(1);
			}
			if(stats.hash !== lastHash){
				lastHash = stats.hash;
				process.stdout.write(stats.toString(outputOptions) + "\n");
			}
			if(!config.watch && stats.hasErrors()) {
				process.on('exit', function(){
					process.exit(2);
				});
			}
		});
	}
	
	triggerNodeLoaded(){
		let nodemonLaunchingFilePath = 'app.dist/.nodemon-launching';
		fs.exists(this.nodemonLaunchingFilePath, function(exists) {
			if(exists) {
				fs.unlink(this.nodemonLaunchingFilePath,function(err){
					if(err){
						console.error(err);
					}
				});
			}
		}.bind(this));
	}

}

module.exports = devflow;
