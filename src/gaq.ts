'use strict';

import vscode = require('vscode');
import cp = require('child_process');
import stream = require('stream');
import { getToolsEnvVars, getBinPath, killProcess } from './util';
import { promptForMissingTool } from './goInstallTools';
import { outputChannel } from './goStatus';

export function getNodeSpan(document: vscode.TextDocument, query: string, token: vscode.CancellationToken | undefined): Promise<NodeSpan[]> {
    return new Promise<NodeSpan[]>((resolve, reject) => {
        let env = getToolsEnvVars();
        const gaq = getBinPath("gaq");
        if (!gaq) {
            return Promise.resolve(undefined);
        }

        let p: cp.ChildProcess;
        if (token) {
            token.onCancellationRequested(() => killProcess(p));
        }

        p = cp.execFile(gaq, ["-f", "pos", query], { env }, (err, stdout, stderr) => {
            try {
                if (err && (<any>err).code === 'ENOENT') {
                    promptForMissingTool('gaq');
                    return resolve(undefined);
                }
                if (err) {
                    let errMsg = stderr ? 'gaq failed: ' + stderr.replace(/\n/g, ' ') : 'gaq failed';
                    console.log(errMsg);
                    outputChannel.appendLine(errMsg);
                    outputChannel.show(true);
                    return reject();
                }

                const lines = stdout.trim().split(/\r?\n/g);
                const spans = lines.map(line => {
                    const [pos, end] = line.split(",").map(t => parseInt(t));
                    return <NodeSpan>{
                        pos, end,
                    };
                });
                return resolve(spans);
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
