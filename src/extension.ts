'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import {
    OPEN_SELECTION_COMMAND_ID, INSTALL_TOOLS_COMMAND_ID, SHOW_IN_EXPLORER_COMMAND_ID,
    SELECT_BY_GAQ_COMMAND_ID, SEARCH_BY_GAQ_COMMAND_ID
} from './commands';
import { AstProvider } from './astProvider';
import { installAllTools } from './goInstallTools';
import { GaqProvider } from './gaqProvider';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const astProvider = new AstProvider();
    const gaqProvider = new GaqProvider();
    astProvider.treeView = vscode.window.createTreeView('go-ast-explorer.view', { treeDataProvider: astProvider });
    context.subscriptions.push(astProvider.treeView);
    context.subscriptions.push(vscode.window.registerTreeDataProvider('go-ast-explorer.view', astProvider));
    context.subscriptions.push(vscode.commands.registerCommand(OPEN_SELECTION_COMMAND_ID, range => astProvider.select(range())));
    context.subscriptions.push(vscode.commands.registerCommand(INSTALL_TOOLS_COMMAND_ID, () => {
        installAllTools();
    }));
    context.subscriptions.push(vscode.commands.registerCommand(SHOW_IN_EXPLORER_COMMAND_ID, () => {
        astProvider.show();
    }));
    context.subscriptions.push(vscode.commands.registerCommand(SELECT_BY_GAQ_COMMAND_ID, () => {
        gaqProvider.selectByQuery();
    }));
    context.subscriptions.push(vscode.commands.registerCommand(SEARCH_BY_GAQ_COMMAND_ID, () => {
        gaqProvider.searchByQuery();
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (!e.affectsConfiguration("go-ast")) {
            return;
        }
        if (e.affectsConfiguration("go-ast.selectOnMove")) {
            astProvider.listenConfigurationChange();
        }
    }));
}

// this method is called when your extension is deactivated
export function deactivate() {
}