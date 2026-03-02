/**
 * Registry for developer console commands.
 * Stores command definitions, handles parsing/execution, and provides autocomplete.
 * @module client/core/ConsoleCommandRegistry
 */

/**
 * Definition of a single parameter for a console command.
 */
export interface ConsoleParam {
    /** Parameter name shown in usage. */
    name: string;
    /** Expected type for validation hints. */
    type: "string" | "number" | "boolean";
    /** Fixed options for autocomplete (e.g. weapon IDs). */
    options?: string[];
    /** Whether this parameter can be omitted. */
    optional?: boolean;
}

/**
 * Definition of a console command.
 */
export interface ConsoleCommand {
    /** Command name (e.g. "cl_giveweapon"). */
    name: string;
    /** Short description shown in autocomplete and help. */
    description: string;
    /** Usage string (e.g. "cl_giveweapon <weapon_id>"). */
    usage: string;
    /** Parameter definitions for autocomplete. */
    params: ConsoleParam[];
    /** Executes the command with parsed arguments. Returns output message. */
    execute: (args: string[]) => string;
}

/**
 * Stores all registered console commands and handles parsing,
 * execution, and autocomplete suggestions.
 */
export class ConsoleCommandRegistry {
    private _commands: Map<string, ConsoleCommand> = new Map();

    /**
     * Registers a console command.
     * @param cmd - The command definition.
     */
    public register(cmd: ConsoleCommand): void {
        this._commands.set(cmd.name.toLowerCase(), cmd);
    }

    /**
     * Parses and executes a raw console input string.
     * @param rawInput - The full command string (e.g. "cl_health 100").
     * @returns Output message string.
     */
    public execute(rawInput: string): string {
        const trimmed = rawInput.trim();
        if (!trimmed) return "";

        const tokens = trimmed.split(/\s+/);
        const cmdName = tokens[0].toLowerCase();
        const args = tokens.slice(1);

        const cmd = this._commands.get(cmdName);
        if (!cmd) {
            return `Unknown command: ${tokens[0]}. Type 'help' for a list of commands.`;
        }

        try {
            return cmd.execute(args);
        } catch (err: any) {
            return `Error: ${err.message ?? err}`;
        }
    }

    /**
     * Returns command name suggestions matching a partial input.
     * @param partial - Partial command name typed so far.
     * @returns Array of matching command names, sorted alphabetically.
     */
    public getSuggestions(partial: string): string[] {
        const lower = partial.toLowerCase();
        const matches: string[] = [];
        for (const cmd of this._commands.values()) {
            if (cmd.name.toLowerCase().startsWith(lower)) {
                matches.push(cmd.name);
            }
        }
        matches.sort();
        return matches;
    }

    /**
     * Returns parameter option suggestions for a specific command and parameter index.
     * @param cmdName - The command name.
     * @param paramIndex - Which parameter is being typed (0-based).
     * @param partial - Partial parameter value typed so far.
     * @returns Array of matching option strings.
     */
    public getParamSuggestions(cmdName: string, paramIndex: number, partial: string): string[] {
        const cmd = this._commands.get(cmdName.toLowerCase());
        if (!cmd || paramIndex >= cmd.params.length) return [];

        const param = cmd.params[paramIndex];
        if (!param.options) return [];

        const lower = partial.toLowerCase();
        return param.options.filter(opt => opt.toLowerCase().startsWith(lower));
    }

    /**
     * Returns the command definition for a given name.
     * @param cmdName - The command name.
     * @returns The command, or undefined if not found.
     */
    public getCommand(cmdName: string): ConsoleCommand | undefined {
        return this._commands.get(cmdName.toLowerCase());
    }

    /**
     * Returns all registered commands sorted alphabetically.
     * @returns Array of all command definitions.
     */
    public getAllCommands(): ConsoleCommand[] {
        const cmds = Array.from(this._commands.values());
        cmds.sort((a, b) => a.name.localeCompare(b.name));
        return cmds;
    }
}
