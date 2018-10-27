'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import stream = require('stream');
import { getToolsEnvVars, getBinPath, killProcess } from './util';
import { promptForMissingTool } from './goInstallTools';
import { outputChannel } from './goStatus';

export function getAst(document: vscode.TextDocument, token: vscode.CancellationToken | undefined): Promise<Node> {
    return new Promise<Node>((resolve, reject) => {
        let env = getToolsEnvVars();
        const goAst = getBinPath("go-ast");
        if (!goAst) {
            return Promise.resolve(undefined);
        }

        let p: cp.ChildProcess;
        if (token) {
            token.onCancellationRequested(() => killProcess(p));
        }

        p = cp.execFile(goAst, [], { env }, (err, stdout, stderr) => {
            try {
                if (err && (<any>err).code === 'ENOENT') {
                    promptForMissingTool('go-ast');
                    return resolve(undefined);
                }
                if (err) {
                    let errMsg = stderr ? 'go-ast failed: ' + stderr.replace(/\n/g, ' ') : 'go-ast failed';
                    console.log(errMsg);
                    outputChannel.appendLine(errMsg);
                    outputChannel.show(true);
                    return reject();
                }

                return resolve(JSON.parse(stdout.toString()) as Node);
            } catch (e) {
                reject(e);
            }
        });

        var stdinStream = new stream.Readable();
        stdinStream.push(document.getText());
        stdinStream.push(null);
        stdinStream.pipe(p.stdin);
    });
}
