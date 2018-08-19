'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { OPEN_SELECTION_COMMAND_ID, INSTALL_TOOLS_COMMAND_ID } from './commands';
import { AstProvider } from './astProvider';
import { installAllTools } from './goInstallTools';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const astProvider = new AstProvider();
    context.subscriptions.push(vscode.window.registerTreeDataProvider('go-ast-explorer.view', astProvider));
    context.subscriptions.push(vscode.commands.registerCommand(OPEN_SELECTION_COMMAND_ID, range => astProvider.select(range)));
    context.subscriptions.push(vscode.commands.registerCommand(INSTALL_TOOLS_COMMAND_ID, () => {
        installAllTools();
    }));
}

// this method is called when your extension is deactivated
export function deactivate() {
}