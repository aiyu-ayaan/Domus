// Domus in GNOME Quick Settings: a tile for the air purifiers and a top-bar icon while one runs.
// The Domus desktop app feeds it over a socket in $XDG_RUNTIME_DIR (apps/desktop/src/main.js, "GNOME Quick
// Settings"): one JSON line per change, and it takes {toggle, on} and {open} back. Every text comes from the
// app, already in its language. Nothing shows while Domus is not running or not signed in.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {QuickMenuToggle, SystemIndicator} from 'resource:///org/gnome/shell/ui/quickSettings.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const ICON = 'weather-windy-symbolic';
// The installed app first, then a development build.
const SOCKETS = ['domus', 'domus-dev'].map(dir => GLib.build_filenamev([GLib.get_user_runtime_dir(), dir, 'tray.sock']));
const encoder = new TextEncoder();

const PurifierToggle = GObject.registerClass(
class PurifierToggle extends QuickMenuToggle {
    _init(send) {
        super._init({iconName: ICON, toggleMode: false});
        this._send = send;
        this._devices = [];
        // The tile switches every purifier it may: all off while any runs, else all on.
        this.connect('clicked', () => {
            const usable = this._devices.filter(d => d.enabled);
            const on = !usable.some(d => d.on);
            for (const d of usable) {
                if (d.on !== on)
                    this._send({toggle: d.id, on});
            }
        });
        this._section = new PopupMenu.PopupMenuSection();
        this.menu.addMenuItem(this._section);
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        this._open = this.menu.addAction('', () => this._send({open: true}));
    }

    update(state) {
        this._devices = state.devices;
        this.title = state.heading;
        this.subtitle = state.title || null;
        this.checked = state.devices.some(d => d.on);
        this.menu.setHeader(ICON, state.heading, state.summary || null);
        this._open.label.text = state.open;
        this._section.removeAll();
        for (const d of state.devices) {
            const item = new PopupMenu.PopupSwitchMenuItem(d.label, d.on);
            item.setSensitive(d.enabled);
            item.connect('toggled', (_item, on) => this._send({toggle: d.id, on}));
            this._section.addMenuItem(item);
        }
    }
});

const DomusIndicator = GObject.registerClass(
class DomusIndicator extends SystemIndicator {
    _init() {
        super._init();
        this._icon = this._addIndicator();
        this._icon.iconName = ICON;
        this._icon.visible = false;
        this._toggle = new PurifierToggle(command => this._write(command));
        this._toggle.visible = false;
        this.quickSettingsItems.push(this._toggle);
        this._cancel = new Gio.Cancellable();
        this._connect();
    }

    // Tries each socket in turn: one left behind by a crashed app refuses, and the next may answer.
    _connect(index = 0) {
        const path = SOCKETS.slice(index).find(p => GLib.file_test(p, GLib.FileTest.EXISTS));
        if (!path) {
            this._later();
            return;
        }
        new Gio.SocketClient().connect_async(Gio.UnixSocketAddress.new(path), this._cancel, (client, res) => {
            try {
                this._conn = client.connect_finish(res);
            } catch {
                if (!this._cancel.is_cancelled())
                    this._connect(SOCKETS.indexOf(path) + 1);
                return;
            }
            this._input = Gio.DataInputStream.new(this._conn.get_input_stream());
            this._read();
        });
    }

    // Domus not running (yet): look again in a few seconds.
    _later() {
        if (this._cancel.is_cancelled())
            return;
        this._retry = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
            this._retry = 0;
            this._connect();
            return GLib.SOURCE_REMOVE;
        });
    }

    _read() {
        this._input.read_line_async(GLib.PRIORITY_DEFAULT, this._cancel, (stream, res) => {
            if (this._cancel.is_cancelled())
                return;
            let line = null;
            try {
                [line] = stream.read_line_finish_utf8(res);
            } catch {
                // the app closed the socket
            }
            if (line === null) {
                this._conn?.close(null);
                this._conn = null;
                this._show(null);
                this._later();
                return;
            }
            try {
                this._show(JSON.parse(line));
            } catch (e) {
                console.warn(`Domus: ${e.message}`);
            }
            this._read();
        });
    }

    _show(state) {
        const shown = Array.isArray(state?.devices) && state.devices.length > 0;
        this._toggle.visible = shown;
        this._icon.visible = shown && state.devices.some(d => d.on);
        if (shown)
            this._toggle.update(state);
    }

    _write(command) {
        try {
            this._conn?.get_output_stream().write_all(encoder.encode(`${JSON.stringify(command)}\n`), null);
        } catch (e) {
            console.warn(`Domus: ${e.message}`);
        }
    }

    destroy() {
        this._cancel.cancel();
        if (this._retry)
            GLib.source_remove(this._retry);
        this._conn?.close(null);
        this.quickSettingsItems.forEach(item => item.destroy());
        super.destroy();
    }
});

export default class DomusExtension extends Extension {
    enable() {
        this._indicator = new DomusIndicator();
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator.destroy();
        this._indicator = null;
    }
}
