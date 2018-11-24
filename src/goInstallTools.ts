/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

'use strict';

import vscode = require('vscode');
import fs = require('fs');
import path = require('path');
import cp = require('child_process');
import { showGoStatus, hideGoStatus, outputChannel } from './goStatus';
import { getBinPath, getToolsGopath, getGoVersion, SemVersion, isVendorSupported, getCurrentGoPath, resolvePath } from './util';

let updatesDeclinedTools: string[] = [];
let installsDeclinedTools: string[] = [];
const allTools: { [key: string]: string } = {
    "go-ast": "github.com/tamayika/go-ast",
    "gaq": "github.com/tamayika/gaq",
};

// Tools used explicitly by the basic features of the extension
const importantTools = [
    'go-ast',
    'gaq',
];

function getTools(goVersion: SemVersion | undefined): string[] {
    let tools: string[] = [
        'go-ast',
        'gaq',
    ];

    return tools;
}

export function installAllTools() {
    const allToolsDescription: { [key: string]: string } = {
        'go-ast': '\t\t(AST dumper)',
        'gaq': '\t\t(AST Query)',
    };

    getGoVersion().then((goVersion) => {
        const allTools = getTools(goVersion);
        vscode.window.showQuickPick(allTools.map(x => `${x} ${allToolsDescription[x]}`), {
            canPickMany: true,
            placeHolder: 'Select the tool to install/update.'
        }).then(selectedTools => {
            installTools((selectedTools || []).map(x => x.substr(0, x.indexOf(' '))));
        });
    });
}

export function promptForMissingTool(tool: string) {
    // If user has declined to install, then don't prompt
    if (installsDeclinedTools.indexOf(tool) > -1) {
        return;
    }
    getGoVersion().then((goVersion) => {
        if (goVersion && goVersion.major === 1 && goVersion.minor < 6) {
            if (tool === 'golint') {
                vscode.window.showInformationMessage('golint no longer supports go1.5, update your settings to use gometalinter as go.lintTool and install gometalinter');
                return;
            }
            if (tool === 'gotests') {
                vscode.window.showInformationMessage('Generate unit tests feature is not supported as gotests tool needs go1.6 or higher.');
                return;
            }
        }

        const items = ['Install'];
        getMissingTools(goVersion).then(missing => {
            if (missing.indexOf(tool) === -1) {
                return;
            }
            missing = missing.filter(x => x === tool || importantTools.indexOf(x) > -1);
            if (missing.length > 1) {
                items.push('Install All');
            }

            vscode.window.showInformationMessage(`The "${tool}" command is not available.  Use "go get -v ${allTools[tool]}" to install.`, ...items).then(selected => {
                if (selected === 'Install') {
                    installTools([tool]);
                } else if (selected === 'Install All') {
                    installTools(missing);
                    hideGoStatus();
                } else {
                    installsDeclinedTools.push(tool);
                }
            });
        });
    });
}

export function promptForUpdatingTool(tool: string) {
    // If user has declined to update, then don't prompt
    if (updatesDeclinedTools.indexOf(tool) > -1) {
        return;
    }
    getGoVersion().then((goVersion) => {
        vscode.window.showInformationMessage(`The Go extension is better with the latest version of "${tool}". Use "go get -u -v ${allTools[tool]}" to update`, 'Update').then(selected => {
            if (selected === 'Update') {
                installTools([tool]);
            } else {
                updatesDeclinedTools.push(tool);
            }
        });
    });
}

/**
 * Installs given array of missing tools. If no input is given, the all tools are installed
 *
 * @param string[] array of tool names to be installed
 */
function installTools(missing: string[]) {
    let goRuntimePath = getBinPath('go');
    if (!goRuntimePath) {
        vscode.window.showInformationMessage('Cannot find "go" binary. Update PATH or GOROOT appropriately');
        return;
    }
    if (!missing) {
        return;
    }

    // http.proxy setting takes precedence over environment variables
    let httpProxy = vscode.workspace.getConfiguration('http').get('proxy');
    let envForTools = Object.assign({}, process.env);
    if (httpProxy) {
        envForTools = Object.assign({}, process.env, {
            http_proxy: httpProxy,
            HTTP_PROXY: httpProxy,
            https_proxy: httpProxy,
            HTTPS_PROXY: httpProxy,
        });
    }

    // If the go.toolsGopath is set, use its value as the GOPATH for the "go get" child process.
    // Else use the Current Gopath
    let toolsGopath = getToolsGopath() || getCurrentGoPath();
    if (toolsGopath) {
        envForTools['GOPATH'] = toolsGopath;
    } else {
        vscode.window.showInformationMessage('Cannot install Go tools. Set either go.gopath or go.toolsGopath in settings.', 'Open User Settings', 'Open Workspace Settings').then(selected => {
            if (selected === 'Open User Settings') {
                vscode.commands.executeCommand('workbench.action.openGlobalSettings');
            } else if (selected === 'Open Workspace Settings') {
                vscode.commands.executeCommand('workbench.action.openWorkspaceSettings');
            }
        });
        return;
    }

    envForTools['GO111MODULE'] = 'off';

    outputChannel.show();
    outputChannel.clear();
    outputChannel.appendLine(`Installing ${missing.length} ${missing.length > 1 ? 'tools' : 'tool'} at ${toolsGopath}${path.sep}bin`);
    missing.forEach((missingTool, index, missing) => {
        outputChannel.appendLine('  ' + missingTool);
    });

    outputChannel.appendLine(''); // Blank line for spacing.

    missing.reduce((res: Promise<(string | undefined)[]>, tool: string) => {
        return res.then(sofar => new Promise<(string | undefined)[]>((resolve, reject) => {
            const callback = (err: Error | null, stdout: string, stderr: string) => {
                if (err) {
                    outputChannel.appendLine('Installing ' + allTools[tool] + ' FAILED');
                    let failureReason = tool + ';;' + err + stdout.toString() + stderr.toString();
                    resolve([...sofar, failureReason]);
                } else {
                    outputChannel.appendLine('Installing ' + allTools[tool] + ' SUCCEEDED');
                    resolve([...sofar, undefined]);
                }
            };

            let closeToolPromise = Promise.resolve(true);

            closeToolPromise.then((success) => {
                if (!success) {
                    resolve([...sofar, ""]);
                    return;
                }
                cp.execFile(goRuntimePath!, ['get', '-u', '-v', allTools[tool]], { env: envForTools }, (err, stdout, stderr) => {
                    if (stderr.indexOf('unexpected directory layout:') > -1) {
                        outputChannel.appendLine(`Installing ${tool} failed with error "unexpected directory layout". Retrying...`);
                        cp.execFile(goRuntimePath!, ['get', '-u', '-v', allTools[tool]], { env: envForTools }, callback);
                    } else {
                        callback(err, stdout, stderr);
                    }
                });
            });

        }));
    }, Promise.resolve([])).then((res: (string | undefined)[]) => {
        outputChannel.appendLine(''); // Blank line for spacing
        let failures = <string[]>res.filter(x => x !== null && x !== undefined);
        if (failures.length === 0) {
            if (missing.indexOf('go-langserver') > -1) {
                outputChannel.appendLine('Reload VS Code window to use the Go language server');
            }
            outputChannel.appendLine('All tools successfully installed. You\'re ready to Go AST:).');
            return;
        }

        outputChannel.appendLine(failures.length + ' tools failed to install.\n');
        failures.forEach((failure, index, failures) => {
            let reason = failure.split(';;');
            outputChannel.appendLine(reason[0] + ':');
            outputChannel.appendLine(reason[1]);
        });
    });
}

export function updateGoPathGoRootFromConfig(): Promise<void> {
    let goroot = vscode.workspace.getConfiguration('go', vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.uri : null)['goroot'];
    if (goroot) {
        process.env['GOROOT'] = resolvePath(goroot);
    }

    if (process.env['GOPATH'] && process.env['GOROOT']) {
        return Promise.resolve();
    }

    // If GOPATH is still not set, then use the one from `go env`
    let goRuntimePath = getBinPath('go');
    if (!goRuntimePath) {
        return Promise.reject(new Error('Cannot find "go" binary. Update PATH or GOROOT appropriately'));
    }
    return new Promise<void>((resolve, reject) => {
        cp.execFile(goRuntimePath!, ['env', 'GOPATH', 'GOROOT'], (err, stdout, stderr) => {
            if (err) {
                return reject();
            }
            let envOutput = stdout.split('\n');
            if (!process.env['GOPATH'] && envOutput[0].trim()) {
                process.env['GOPATH'] = envOutput[0].trim();
            }
            if (!process.env['GOROOT'] && envOutput[1] && envOutput[1].trim()) {
                process.env['GOROOT'] = envOutput[1].trim();
            }
            return resolve();
        });
    });
}

export function offerToInstallTools() {
    isVendorSupported();

    getGoVersion().then(goVersion => {
        getMissingTools(goVersion).then(missing => {
            missing = missing.filter(x => importantTools.indexOf(x) > -1);
            if (missing.length > 0) {
                showGoStatus('Analysis Tools Missing', 'go.promptforinstall', 'Not all Go tools are available on the GOPATH');
                vscode.commands.registerCommand('go.promptforinstall', () => {
                    promptForInstall(missing);
                });
            }
        });
    });


    function promptForInstall(missing: string[]) {
        let installItem = {
            title: 'Install',
            command() {
                hideGoStatus();
                installTools(missing);
            }
        };
        let showItem = {
            title: 'Show',
            command() {
                outputChannel.clear();
                outputChannel.appendLine('Below tools are needed for the basic features of the Go extension.');
                missing.forEach(x => outputChannel.appendLine(x));
            }
        };
        vscode.window.showInformationMessage('Some Go analysis tools are missing from your GOPATH.  Would you like to install them?', installItem, showItem).then(selection => {
            if (selection) {
                selection.command();
            } else {
                hideGoStatus();
            }
        });
    }
}

function getMissingTools(goVersion: SemVersion | undefined): Promise<string[]> {
    let keys = getTools(goVersion);
    return Promise.all<string>(keys.map(tool => new Promise<string>((resolve, reject) => {
        let toolPath = getBinPath(tool);
        fs.exists(toolPath || "", exists => {
            resolve(exists ? undefined : tool);
        });
    }))).then(res => {
        return res.filter(x => x !== null && x !== undefined);
    });
}
