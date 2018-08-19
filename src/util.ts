/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------*/

import vscode = require('vscode');
import path = require('path');
import { getBinPathWithPreferredGopath, resolveHomeDir, getInferredGopath, fixDriveCasingInWindows } from './goPath';
import cp = require('child_process');
import fs = require('fs');
import os = require('os');

export interface SemVersion {
    major: number;
    minor: number;
}

let goVersion: SemVersion | undefined;
let vendorSupport: boolean | undefined;
let toolsGopath: string | undefined;

/**
 * Gets version of Go based on the output of the command `go version`.
 * Returns null if go is being used from source/tip in which case `go version` will not return release tag like go1.6.3
 */
export function getGoVersion(): Promise<SemVersion | undefined> {
    let goRuntimePath = getBinPath('go');

    if (!goRuntimePath) {
        vscode.window.showInformationMessage('Cannot find "go" binary. Update PATH or GOROOT appropriately');
        return Promise.resolve(undefined);
    }

    if (goVersion) {
        return Promise.resolve(goVersion);
    }

    return new Promise<SemVersion>((resolve, reject) => {
        cp.execFile(goRuntimePath!, ['version'], {}, (err, stdout, stderr) => {
            let matches = /go version go(\d).(\d+).*/.exec(stdout);
            if (matches) {
                goVersion = {
                    major: parseInt(matches[1]),
                    minor: parseInt(matches[2])
                };
            }
            return resolve(goVersion);
        });
    });
}

/**
 * Returns boolean denoting if current version of Go supports vendoring
 */
export function isVendorSupported(): Promise<boolean> {
    if (vendorSupport !== null && vendorSupport !== undefined) {
        return Promise.resolve(vendorSupport);
    }
    return getGoVersion().then(version => {
        if (!version) {
            return process.env['GO15VENDOREXPERIMENT'] === '0' ? false : true;
        }

        switch (version.major) {
            case 0:
                vendorSupport = false;
                break;
            case 1:
                vendorSupport = (version.minor > 6 || ((version.minor === 5 || version.minor === 6) && process.env['GO15VENDOREXPERIMENT'] === '1')) ? true : false;
                break;
            default:
                vendorSupport = true;
                break;
        }
        return vendorSupport;
    });
}

export function getToolsGopath(useCache: boolean = true): string | undefined {
    if (!useCache || !toolsGopath) {
        toolsGopath = resolveToolsGopath();
    }

    return toolsGopath;
}

function resolveToolsGopath(): string | undefined {

    let toolsGopathForWorkspace = vscode.workspace.getConfiguration('go')['toolsGopath'] || '';

    // In case of single root, use resolvePath to resolve ~ and ${workspaceRoot}
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length <= 1) {
        return resolvePath(toolsGopathForWorkspace);
    }

    // In case of multi-root, resolve ~ and ignore ${workspaceRoot}
    if (toolsGopathForWorkspace.startsWith('~')) {
        toolsGopathForWorkspace = path.join(os.homedir(), toolsGopathForWorkspace.substr(1));
    }
    if (toolsGopathForWorkspace && toolsGopathForWorkspace.trim() && !/\${workspaceRoot}/.test(toolsGopathForWorkspace)) {
        return toolsGopathForWorkspace;
    }

    // If any of the folders in multi root have toolsGopath set, use it.
    for (let i = 0; i < vscode.workspace.workspaceFolders.length; i++) {
        const configValue = vscode.workspace.getConfiguration('go', vscode.workspace.workspaceFolders[i].uri).inspect('toolsGopath');
        if (configValue && configValue.workspaceFolderValue) {
            const toolsGopath = resolvePath(<string>configValue.workspaceFolderValue, vscode.workspace.workspaceFolders[i].uri.fsPath);
            if (toolsGopath) {
                return toolsGopath;
            }
        }
    }
}

export function getBinPath(tool: string): string | undefined {
    return getBinPathWithPreferredGopath(tool,
        tool === 'go' ? [] : [getToolsGopath(), getCurrentGoPath()],
        vscode.workspace.getConfiguration('go', null).get('alternateTools') || {});
}

export function getToolsEnvVars(): any {
    const config = vscode.workspace.getConfiguration('go', vscode.window.activeTextEditor ? vscode.window.activeTextEditor.document.uri : null);
    const toolsEnvVars = config['toolsEnvVars'];

    const gopath = getCurrentGoPath();
    const envVars = Object.assign({}, process.env, gopath ? { GOPATH: gopath } : {});

    if (toolsEnvVars && typeof toolsEnvVars === 'object') {
        Object.keys(toolsEnvVars).forEach(key => envVars[key] = typeof toolsEnvVars[key] === 'string' ? resolvePath(toolsEnvVars[key]) : toolsEnvVars[key]);
    }

    // cgo expects go to be in the path
    const goroot: string | undefined = envVars['GOROOT'];
    let pathEnvVar: string | undefined;
    if (envVars.hasOwnProperty('PATH')) {
        pathEnvVar = 'PATH';
    } else if (process.platform === 'win32' && envVars.hasOwnProperty('Path')) {
        pathEnvVar = 'Path';
    }
    if (goroot && pathEnvVar && envVars[pathEnvVar] && (<string>envVars[pathEnvVar]).split(path.delimiter).indexOf(goroot) === -1) {
        envVars[pathEnvVar] += path.delimiter + path.join(goroot, 'bin');
    }

    return envVars;
}

export function getCurrentGoPath(workspaceUri?: vscode.Uri): string {
    let currentFilePath: string | undefined;
    if (vscode.window.activeTextEditor) {
        const folder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
        if (folder) {
            workspaceUri = workspaceUri || folder.uri;
            currentFilePath = vscode.window.activeTextEditor.document.uri.fsPath;
        }
    }
    const config = vscode.workspace.getConfiguration('go', workspaceUri);
    let currentRoot = workspaceUri ? workspaceUri.fsPath : vscode.workspace.rootPath;

    // Workaround for issue in https://github.com/Microsoft/vscode/issues/9448#issuecomment-244804026
    if (process.platform === 'win32') {
        currentRoot = fixDriveCasingInWindows(currentRoot || '');
        currentFilePath = fixDriveCasingInWindows(currentFilePath || '');
    }

    // Infer the GOPATH from the current root or the path of the file opened in current editor
    // Last resort: Check for the common case where GOPATH itself is opened directly in VS Code
    let inferredGopath: string | undefined;
    if (config['inferGopath'] === true) {
        inferredGopath = getInferredGopath(currentRoot || '') || getInferredGopath(currentFilePath || '');
        if (!inferredGopath) {
            try {
                if (fs.statSync(path.join(currentRoot || '', 'src')).isDirectory()) {
                    inferredGopath = currentRoot;
                }
            }
            catch (e) {
                // No op
            }
        }
        if (inferredGopath && process.env['GOPATH'] && inferredGopath !== process.env['GOPATH']) {
            inferredGopath += path.delimiter + process.env['GOPATH'];
        }
    }

    const configGopath = config['gopath'] ? resolvePath(config['gopath'], currentRoot) : '';
    return inferredGopath ? inferredGopath : (configGopath || process.env['GOPATH'] || '');
}

/**
 * Exapnds ~ to homedir in non-Windows platform and resolves ${workspaceRoot}
 */
export function resolvePath(inputPath: string, workspaceRoot?: string): string {
    if (!inputPath || !inputPath.trim()) {
        return inputPath;
    }

    if (!workspaceRoot && vscode.workspace.workspaceFolders) {
        if (vscode.workspace.workspaceFolders.length === 1) {
            workspaceRoot = vscode.workspace.rootPath;
        } else if (vscode.window.activeTextEditor) {
            const folder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
            if (folder) {
                workspaceRoot = folder.uri.fsPath;
            }
        }
    }

    if (workspaceRoot) {
        inputPath = inputPath.replace(/\${workspaceRoot}/g, workspaceRoot).replace(/\${workspaceFolder}/g, workspaceRoot);
    }
    return resolveHomeDir(inputPath);
}

export function killProcess(p: cp.ChildProcess) {
    if (p) {
        try {
            p.kill();
        } catch (e) {
            console.log('Error killing process: ' + e);
        }
    }
}
