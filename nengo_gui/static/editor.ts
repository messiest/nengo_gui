/**
 * Code Editor
 *
 * Ace function is written into HTML by server and called when the
 * page is loaded.
 *
 * @constructor
 * @param {string} uid - A unique identifier
 * @param {dict} args - A set of constructor arguments (see Component)
 */

import * as ace from "brace";
import "brace/mode/python";
import * as interact from "interact.js";
import * as $ from "jquery";

import { config } from "./config";
import { HotkeyManager } from "./hotkeys";
import * as utils from "./utils";
import { EditorView } from "./views/editor";
import { Connection } from "./websocket";

const Range = ace.acequire("ace/range").Range;

export class Editor {
    currentCode;
    editor;
    marker;
    maxWidth;
    minWidth: number = 50;
    saveDisabled: boolean = true;
    syncIntervalID: number = null;
    view = new EditorView();
    ws;

    // syncWithServer called at most once per 150 ms
    syncWithServer = utils.throttle((save: boolean = false) => {
        if (this.editorCode !== this.currentCode) {
            this.ws.send(JSON.stringify({code: this.editorCode, save}));
            this.currentCode = this.editorCode;
            this.view.editor.dispatchEvent(new Event("saved"));
        }
    }, 150);

    onresize = utils.throttle(() => {
        this.maxWidth = window.innerWidth - 100;
        if (this.width > this.maxWidth) {
            this.width = this.maxWidth;
        }
        this.redraw();
    }, 66);

    redraw = utils.throttle(() => {
        this.editor.resize();
        // if (this.netgraph !== undefined && this.netgraph !== null) {
        //     this.netgraph.onresize();
        // }
        // viewport.onresize();
    }, 66);

    private attached: Connection[] = [];

    constructor(netgraph) {
        // if (uid[0] === "<") {
        //     console.error("invalid uid for Editor: " + uid);
        // }

        this.maxWidth = window.innerWidth - 100;

        this.currentCode = "";

        // Set up Ace editor
        this.editor = ace.edit(this.view.editor);
        this.editor.getSession().setMode("ace/mode/python");
        this.editor.gotoLine(1);
        this.marker = null;
        this.view.consoleHeight = this.consoleHeight;

        this.redraw();

        // Sync with server every 200 ms
        if (this.autoUpdate) {
            this.syncIntervalID = window.setInterval(() => {
                this.syncWithServer();
            }, 200);
        }

        // Add event handlers
        window.addEventListener("resize", utils.throttle(() => {
            this.onresize();
        }, 66)); // 66 ms throttle = 15 FPS update

        interact(this.view.editor)
            .resizable({
                edges: { bottom: false, left: true, right: false, top: false },
            }).on("resizemove", (event) => {
                this.width -= event.deltaRect.left;
            });

        interact(this.view.console)
            .resizable({
                edges: { bottom: false, left: true, right: false, top: true },
            }).on("resizemove", (event) => {
                const max = this.view.height - 40;
                const min = 20;
                const height = this.consoleHeight - event.deltaRect.top;
                this.consoleHeight = utils.clip(height, min, max);
                this.width -= event.deltaRect.left;
            }); // .on("resizeend", () {
            //     this.consoleHeight = this.consoleHeight;
            // });

        document.addEventListener("nengoConfigChange", (event: CustomEvent) => {
            const key = event.detail;
            if (key === "editorWidth") {
                this.view.width =
                    utils.clip(this.width, this.minWidth, this.maxWidth);
                this.redraw();
            } else if (key === "consoleHeight") {
                this.view.consoleHeight = this.consoleHeight;
                this.redraw();
            } else if (key === "hideEditor") {
                this.view.hidden = this.hidden;
            } else if (key === "editorFontSize") {
                this.editor.setFontSize(Math.max(this.fontSize, 6));
            } else if (key === "autoUpdate") {
                if (this.autoUpdate && this.syncIntervalID === null) {
                    this.syncIntervalID = window.setInterval(() => {
                        this.syncWithServer();
                    }, 200);
                } else if (!this.autoUpdate && this.syncIntervalID !== null) {
                    window.clearInterval(this.syncIntervalID);
                    this.syncIntervalID = null;
                }
            }
        });
    }

    // Automatically update the model based on the text
    get autoUpdate(): boolean {
        return config.autoUpdate;
    }

    set autoUpdate(val: boolean) {
        config.autoUpdate = val;
    }

    get editorCode(): string {
        return this.editor.getValue();
    }

    get consoleHeight(): number {
        return config.consoleHeight;
    }

    set consoleHeight(val: number) {
        config.consoleHeight = val;
    }

    get fontSize(): number {
        return config.editorFontSize;
    }

    set fontSize(val: number) {
        config.editorFontSize = val;
    }

    get hidden(): boolean {
        return config.hideEditor;
    }

    set hidden(val: boolean) {
        config.hideEditor = val;
    }

    get width(): number {
        return config.editorWidth;
    }

    set width(val: number) {
        config.editorWidth = val;
    }

    attach(conn: Connection) {

        conn.bind("editor.code", ({code}) => {
            this.editor.setValue(code);
            this.currentCode = code;
            this.editor.gotoLine(1);
            this.redraw();
        });

        conn.bind("editor.stdout", ({stdout}) => {
            if (this.marker !== null) {
                this.editor.getSession().removeMarker(this.marker);
                this.marker = null;
                this.editor.getSession().clearAnnotations();
            }
            this.view.stdout = stdout;
            this.view.stderr = "";
            this.view.console.scrollTop = this.view.console.scrollHeight;
        });

        conn.bind("editor.filename", ({filename, error}) => {
            if (error === null) {
                document.getElementById("filename")[0].innerHTML = filename;
                // Update the URL so reload and bookmarks work as expected
                history.pushState({}, filename, "/?filename=" + filename);
            } else {
                alert(error); // TODO: modal instead of alert
            }
        });

        conn.bind("editor.error", ({error, shortMsg, stdout}) => {
            const line = error.line;
            this.marker = this.editor.getSession()
                .addMarker(new Range(line - 1, 0, line - 1, 10),
                           "highlight", "fullLine", true);
            this.editor.getSession().setAnnotations([{
                row: line - 1,
                text: shortMsg,
                type: "error",
            }]);
            this.view.stdout = stdout;
            this.view.stderr = error.trace;
            this.view.console.scrollTop = this.view.console.scrollHeight;
        });

        this.attached.push(conn);
    }

    attachToolbar(toolbar: any) {
        // TODO: get handles
        // Setup the button to toggle the code editor
        $("#Toggle_ace").on("click", () => {
            this.toggleHidden();
        });
        $("#Save_file").on("click", () => {
            this.saveFile();
        });
        $("#Font_increase").on("click", () => {
            this.fontSize += 1;
        });
        $("#Font_decrease").on("click", () => {
            this.fontSize -= 1;
        });
        this.editor.on("change", () => {
            $("#Sync_editor_button").removeClass("disabled");
        });
        this.view.editor.addEventListener("saved", () => {
            $("#Sync_editor_button").addClass("disabled");
        });
    }

    hotkeys(manager: HotkeyManager) {
        manager.add("Toggle editor", "e", {ctrl: true}, () => {
            this.toggleHidden();
        });
        manager.add("Save", "s", {ctrl: true}, () => {
            this.saveFile();
        });
        // TODO: pick better shortcuts
        manager.add("Toggle auto-update", "1",
            {ctrl: true, shift: true}, () => {
                this.autoUpdate = !this.autoUpdate;
        });
        manager.add("Update display", "1", {ctrl: true}, () => {
            this.syncWithServer();
        });
    }

    saveFile() {
        this.syncWithServer(true);
    }

    toggleHidden() {
        if (this.hidden) {
            this.hidden = false;
        } else {
            this.hidden = true;
        }
        this.redraw();
    }
}
