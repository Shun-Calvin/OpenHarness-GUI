"""CLI entry point using typer."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Optional

import typer

__version__ = "0.1.1"


def _version_callback(value: bool) -> None:
    if value:
        print(f"openharness {__version__}")
        raise typer.Exit()


app = typer.Typer(
    name="openharness",
    help=(
        "Oh my Harness! An AI-powered coding assistant.\n\n"
        "Starts an interactive session by default, use -p/--print for non-interactive output."
    ),
    add_completion=False,
    rich_markup_mode="rich",
    invoke_without_command=True,
)


# ---------------------------------------------------------------------------
# Subcommands
# ---------------------------------------------------------------------------

mcp_app = typer.Typer(name="mcp", help="Manage MCP servers")
plugin_app = typer.Typer(name="plugin", help="Manage plugins")
auth_app = typer.Typer(name="auth", help="Manage authentication")
provider_app = typer.Typer(name="provider", help="Manage provider profiles")
cron_app = typer.Typer(name="cron", help="Manage cron scheduler and jobs")

app.add_typer(mcp_app)
app.add_typer(plugin_app)
app.add_typer(auth_app)
app.add_typer(provider_app)
app.add_typer(cron_app)


# ---- mcp subcommands ----

@mcp_app.command("list")
def mcp_list() -> None:
    """List configured MCP servers."""
    from openharness.config import load_settings
    from openharness.mcp.config import load_mcp_server_configs
    from openharness.plugins import load_plugins

    settings = load_settings()
    plugins = load_plugins(settings, str(Path.cwd()))
    configs = load_mcp_server_configs(settings, plugins)
    if not configs:
        print("No MCP servers configured.")
        return
    for name, cfg in configs.items():
        transport = cfg.get("transport", cfg.get("command", "unknown"))
        print(f"  {name}: {transport}")


@mcp_app.command("add")
def mcp_add(
    name: str = typer.Argument(..., help="Server name"),
    config_json: str = typer.Argument(..., help="Server config as JSON string"),
) -> None:
    """Add an MCP server configuration."""
    from openharness.config import load_settings, save_settings

    settings = load_settings()
    try:
        cfg = json.loads(config_json)
    except json.JSONDecodeError as exc:
        print(f"Invalid JSON: {exc}", file=sys.stderr)
        raise typer.Exit(1)
    if not isinstance(settings.mcp_servers, dict):
        settings.mcp_servers = {}
    settings.mcp_servers[name] = cfg
    save_settings(settings)
    print(f"Added MCP server: {name}")


@mcp_app.command("remove")
def mcp_remove(
    name: str = typer.Argument(..., help="Server name to remove"),
) -> None:
    """Remove an MCP server configuration."""
    from openharness.config import load_settings, save_settings

    settings = load_settings()
    if not isinstance(settings.mcp_servers, dict) or name not in settings.mcp_servers:
        print(f"MCP server not found: {name}", file=sys.stderr)
        raise typer.Exit(1)
    del settings.mcp_servers[name]
    save_settings(settings)
    print(f"Removed MCP server: {name}")


# ---- plugin subcommands ----

@plugin_app.command("list")
def plugin_list() -> None:
    """List installed plugins."""
    from openharness.config import load_settings
    from openharness.plugins import load_plugins

    settings = load_settings()
    plugins = load_plugins(settings, str(Path.cwd()))
    if not plugins:
        print("No plugins installed.")
        return
    for plugin in plugins:
        status = "enabled" if plugin.enabled else "disabled"
        print(f"  {plugin.name} [{status}] - {plugin.description or ''}")


@plugin_app.command("install")
def plugin_install(
    source: str = typer.Argument(..., help="Plugin source (path or URL)"),
) -> None:
    """Install a plugin from a source path."""
    from openharness.plugins.installer import install_plugin_from_path

    result = install_plugin_from_path(source)
    print(f"Installed plugin: {result}")


@plugin_app.command("uninstall")
def plugin_uninstall(
    name: str = typer.Argument(..., help="Plugin name to uninstall"),
) -> None:
    """Uninstall a plugin."""
    from openharness.plugins.installer import uninstall_plugin

    uninstall_plugin(name)
    print(f"Uninstalled plugin: {name}")


# ---- cron subcommands ----

@cron_app.command("start")
def cron_start() -> None:
    """Start the cron scheduler daemon."""
    from openharness.services.cron_scheduler import is_scheduler_running, start_daemon

    if is_scheduler_running():
        print("Cron scheduler is already running.")
        return
    pid = start_daemon()
    print(f"Cron scheduler started (pid={pid})")


@cron_app.command("stop")
def cron_stop() -> None:
    """Stop the cron scheduler daemon."""
    from openharness.services.cron_scheduler import stop_scheduler

    if stop_scheduler():
        print("Cron scheduler stopped.")
    else:
        print("Cron scheduler is not running.")


@cron_app.command("status")
def cron_status_cmd() -> None:
    """Show cron scheduler status and job summary."""
    from openharness.services.cron_scheduler import scheduler_status

    status = scheduler_status()
    state = "running" if status["running"] else "stopped"
    print(f"Scheduler: {state}" + (f" (pid={status['pid']})" if status["pid"] else ""))
    print(f"Jobs:      {status['enabled_jobs']} enabled / {status['total_jobs']} total")
    print(f"Log:       {status['log_file']}")


@cron_app.command("list")
def cron_list_cmd() -> None:
    """List all registered cron jobs with schedule and status."""
    from openharness.services.cron import load_cron_jobs

    jobs = load_cron_jobs()
    if not jobs:
        print("No cron jobs configured.")
        return
    for job in jobs:
        enabled = "on " if job.get("enabled", True) else "off"
        last = job.get("last_run", "never")
        if last != "never":
            last = last[:19]  # trim to readable datetime
        last_status = job.get("last_status", "")
        status_indicator = f" [{last_status}]" if last_status else ""
        print(f"  [{enabled}] {job['name']}  {job.get('schedule', '?')}")
        print(f"        cmd: {job['command']}")
        print(f"        last: {last}{status_indicator}  next: {job.get('next_run', 'n/a')[:19]}")


@cron_app.command("toggle")
def cron_toggle_cmd(
    name: str = typer.Argument(..., help="Cron job name"),
    enabled: bool = typer.Argument(..., help="true to enable, false to disable"),
) -> None:
    """Enable or disable a cron job."""
    from openharness.services.cron import set_job_enabled

    if not set_job_enabled(name, enabled):
        print(f"Cron job not found: {name}")
        raise typer.Exit(1)
    state = "enabled" if enabled else "disabled"
    print(f"Cron job '{name}' is now {state}")


@cron_app.command("history")
def cron_history_cmd(
    name: str | None = typer.Argument(None, help="Filter by job name"),
    limit: int = typer.Option(20, "--limit", "-n", help="Number of entries"),
) -> None:
    """Show cron execution history."""
    from openharness.services.cron_scheduler import load_history

    entries = load_history(limit=limit, job_name=name)
    if not entries:
        print("No execution history.")
        return
    for entry in entries:
        ts = entry.get("started_at", "?")[:19]
        status = entry.get("status", "?")
        rc = entry.get("returncode", "?")
        print(f"  {ts}  {entry.get('name', '?')}  {status} (rc={rc})")
        stderr = entry.get("stderr", "").strip()
        if stderr and status != "success":
            for line in stderr.splitlines()[:3]:
                print(f"    stderr: {line}")


@cron_app.command("logs")
def cron_logs_cmd(
    lines: int = typer.Option(30, "--lines", "-n", help="Number of lines to show"),
) -> None:
    """Show recent cron scheduler log output."""
    from openharness.config.paths import get_logs_dir

    log_path = get_logs_dir() / "cron_scheduler.log"
    if not log_path.exists():
        print("No scheduler log found. Start the scheduler with: oh cron start")
        return
    content = log_path.read_text(encoding="utf-8", errors="replace")
    tail = content.splitlines()[-lines:]
    for line in tail:
        print(line)


# ---- auth subcommands ----

# Mapping from provider name to human-readable label for interactive prompts.
_PROVIDER_LABELS: dict[str, str] = {
    "anthropic": "Anthropic (Claude API)",
    "anthropic_claude": "Claude subscription (Claude CLI)",
    "openai": "OpenAI / compatible",
    "openai_codex": "OpenAI Codex subscription (Codex CLI)",
    "copilot": "GitHub Copilot",
    "dashscope": "Alibaba DashScope",
    "bedrock": "AWS Bedrock",
    "vertex": "Google Vertex AI",
}

_AUTH_SOURCE_LABELS: dict[str, str] = {
    "anthropic_api_key": "Anthropic API key",
    "openai_api_key": "OpenAI API key",
    "codex_subscription": "Codex subscription",
    "claude_subscription": "Claude subscription",
    "copilot_oauth": "GitHub Copilot OAuth",
    "dashscope_api_key": "DashScope API key",
    "bedrock_api_key": "Bedrock credentials",
    "vertex_api_key": "Vertex credentials",
}


def _maybe_update_default_model_for_provider(provider: str) -> None:
    """Keep the active model in-family after switching auth providers."""
    from openharness.auth.manager import AuthManager

    manager = AuthManager()
    profile_name = {
        "openai_codex": "codex",
        "anthropic_claude": "claude-subscription",
    }.get(provider)
    if profile_name is None:
        return
    profile = manager.list_profiles()[profile_name]
    model = profile.resolved_model.lower()
    target_model = None
    if provider == "openai_codex" and not model.startswith(("gpt-", "o1", "o3", "o4")):
        target_model = "gpt-5.4"
    elif provider == "anthropic_claude" and not model.startswith("claude-"):
        target_model = "sonnet"
    if not target_model:
        return
    manager.update_profile(profile_name, default_model=target_model, last_model=target_model)


def _bind_external_provider(provider: str) -> None:
    """Bind a provider to credentials managed by an external CLI."""
    from openharness.auth.external import default_binding_for_provider, load_external_credential
    from openharness.auth.storage import store_external_binding

    binding = default_binding_for_provider(provider)
    try:
        credential = load_external_credential(
            binding,
            refresh_if_needed=(provider == "anthropic_claude"),
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr, flush=True)
        raise typer.Exit(1)

    profile_label = credential.profile_label or binding.profile_label
    store_external_binding(
        binding.__class__(
            provider=binding.provider,
            source_path=binding.source_path,
            source_kind=binding.source_kind,
            managed_by=binding.managed_by,
            profile_label=profile_label,
        )
    )

    _maybe_update_default_model_for_provider(provider)
    label = _PROVIDER_LABELS.get(provider, provider)
    profile_name = {
        "openai_codex": "codex",
        "anthropic_claude": "claude-subscription",
    }[provider]
    print(f"{label} bound from {credential.source_path}.", flush=True)
    print(f"Use `oh provider use {profile_name}` to activate it.", flush=True)


@auth_app.command("login")
def auth_login(
    provider: Optional[str] = typer.Argument(None, help="Provider name (anthropic, openai, copilot, …)"),
) -> None:
    """Interactively authenticate with a provider.

    Run without arguments to choose a provider from a menu.
    Supported providers: anthropic, anthropic_claude, openai, openai_codex, copilot, dashscope, bedrock, vertex.
    """
    from openharness.auth.flows import ApiKeyFlow
    from openharness.auth.manager import AuthManager
    from openharness.auth.storage import store_credential

    manager = AuthManager()

    if provider is None:
        print("Select a provider to authenticate:", flush=True)
        labels = list(_PROVIDER_LABELS.items())
        for i, (name, label) in enumerate(labels, 1):
            print(f"  {i}. {label} [{name}]", flush=True)
        raw = typer.prompt("Enter number or provider name", default="1")
        try:
            idx = int(raw.strip()) - 1
            if 0 <= idx < len(labels):
                provider = labels[idx][0]
            else:
                print("Invalid selection.", file=sys.stderr)
                raise typer.Exit(1)
        except ValueError:
            provider = raw.strip()

    provider = provider.lower()

    if provider == "copilot":
        _run_copilot_login()
        return

    if provider in ("openai_codex", "anthropic_claude"):
        _bind_external_provider(provider)
        return

    # API-key–based providers
    if provider in ("anthropic", "openai", "dashscope", "bedrock", "vertex"):
        label = _PROVIDER_LABELS.get(provider, provider)
        flow = ApiKeyFlow(provider=provider, prompt_text=f"Enter your {label} API key")
        try:
            key = flow.run()
        except ValueError as exc:
            print(f"Error: {exc}", file=sys.stderr)
            raise typer.Exit(1)
        store_credential(provider, "api_key", key)
        try:
            manager.store_credential(provider, "api_key", key)
        except Exception:
            pass
        print(f"{label} API key saved.", flush=True)
        return

    print(f"Unknown provider: {provider!r}. Known: {', '.join(_PROVIDER_LABELS)}", file=sys.stderr)
    raise typer.Exit(1)


@auth_app.command("status")
def auth_status_cmd() -> None:
    """Show authentication source and provider profile status."""
    from openharness.auth.manager import AuthManager

    manager = AuthManager()
    auth_sources = manager.get_auth_source_statuses()
    profiles = manager.get_profile_statuses()

    print("Auth sources:")
    print(f"{'Source':<24} {'State':<14} {'Origin':<10} Active")
    print("-" * 60)
    for name, info in auth_sources.items():
        label = _AUTH_SOURCE_LABELS.get(name, name)
        active_str = "<-- active" if info["active"] else ""
        print(f"{label:<24} {info['state']:<14} {info['source']:<10} {active_str}")
        if info.get("detail"):
            print(f"  detail: {info['detail']}")

    print()
    print("Provider profiles:")
    print(f"{'Profile':<20} {'Provider':<18} {'Auth source':<22} {'State':<12} Active")
    print("-" * 92)
    for name, info in profiles.items():
        status_str = "ready" if info["configured"] else info.get("auth_state", "missing auth")
        active_str = "<-- active" if info["active"] else ""
        print(f"{name:<20} {info['provider']:<18} {info['auth_source']:<22} {status_str:<12} {active_str}")


@auth_app.command("logout")
def auth_logout(
    provider: Optional[str] = typer.Argument(None, help="Provider to log out (default: active provider)"),
) -> None:
    """Clear stored authentication for a provider."""
    from openharness.auth.manager import AuthManager

    manager = AuthManager()
    target = provider or manager.list_profiles()[manager.get_active_profile()].provider
    manager.clear_credential(target)
    print(f"Authentication cleared for provider: {target}", flush=True)


@auth_app.command("switch")
def auth_switch(
    provider: str = typer.Argument(..., help="Auth source or profile to activate"),
) -> None:
    """Switch the auth source for the active profile, or use a profile by name."""
    from openharness.auth.manager import AuthManager

    manager = AuthManager()
    try:
        manager.switch_provider(provider)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise typer.Exit(1)
    print(f"Switched auth/profile to: {provider}", flush=True)


# ---------------------------------------------------------------------------
# Copilot login helper (kept as a named function for reuse and backward compat)
# ---------------------------------------------------------------------------


def _run_copilot_login() -> None:
    """Run the GitHub Copilot device-code flow and persist the result."""
    from openharness.api.copilot_auth import save_copilot_auth
    from openharness.auth.flows import DeviceCodeFlow

    print("Select GitHub deployment type:", flush=True)
    print("  1. GitHub.com (public)", flush=True)
    print("  2. GitHub Enterprise (data residency / self-hosted)", flush=True)
    choice = typer.prompt("Enter choice", default="1")

    enterprise_url: str | None = None
    github_domain = "github.com"

    if choice.strip() == "2":
        raw_url = typer.prompt("Enter your GitHub Enterprise URL or domain (e.g. company.ghe.com)")
        domain = raw_url.replace("https://", "").replace("http://", "").rstrip("/")
        if not domain:
            print("Error: domain cannot be empty.", file=sys.stderr, flush=True)
            raise typer.Exit(1)
        enterprise_url = domain
        github_domain = domain

    print(flush=True)
    flow = DeviceCodeFlow(github_domain=github_domain, enterprise_url=enterprise_url)
    try:
        token = flow.run()
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr, flush=True)
        raise typer.Exit(1)

    save_copilot_auth(token, enterprise_url=enterprise_url)
    print("GitHub Copilot authenticated successfully.", flush=True)
    if enterprise_url:
        print(f"  Enterprise domain: {enterprise_url}", flush=True)
    print(flush=True)
    print("To use Copilot as the provider, run:", flush=True)
    print("  oh provider use copilot", flush=True)


@auth_app.command("copilot-login")
def auth_copilot_login() -> None:
    """Authenticate with GitHub Copilot via device flow (alias for 'oh auth login copilot')."""
    _run_copilot_login()


@auth_app.command("codex-login")
def auth_codex_login() -> None:
    """Bind OpenHarness to a local Codex CLI subscription session."""
    _bind_external_provider("openai_codex")


@auth_app.command("claude-login")
def auth_claude_login() -> None:
    """Bind OpenHarness to a local Claude CLI subscription session."""
    _bind_external_provider("anthropic_claude")


@auth_app.command("copilot-logout")
def auth_copilot_logout() -> None:
    """Remove stored GitHub Copilot authentication."""
    from openharness.api.copilot_auth import clear_github_token

    clear_github_token()
    print("Copilot authentication cleared.")


# ---- provider subcommands ----


@provider_app.command("list")
def provider_list() -> None:
    """List configured provider profiles."""
    from openharness.auth.manager import AuthManager

    statuses = AuthManager().get_profile_statuses()
    for name, info in statuses.items():
        marker = "*" if info["active"] else " "
        configured = "ready" if info["configured"] else "missing auth"
        base = info["base_url"] or "(default)"
        print(f"{marker} {name}: {info['label']} [{configured}]")
        print(f"    provider={info['provider']} auth={info['auth_source']} model={info['model']} base_url={base}")


@provider_app.command("use")
def provider_use(
    name: str = typer.Argument(..., help="Provider profile name"),
) -> None:
    """Activate a provider profile."""
    from openharness.auth.manager import AuthManager

    manager = AuthManager()
    try:
        manager.use_profile(name)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise typer.Exit(1)
    print(f"Activated provider profile: {name}", flush=True)


@provider_app.command("add")
def provider_add(
    name: str = typer.Argument(..., help="Provider profile name"),
    label: str = typer.Option(..., "--label", help="Display label"),
    provider: str = typer.Option(..., "--provider", help="Runtime provider id"),
    api_format: str = typer.Option(..., "--api-format", help="API format"),
    auth_source: str = typer.Option(..., "--auth-source", help="Auth source name"),
    model: str = typer.Option(..., "--model", help="Default model"),
    base_url: str | None = typer.Option(None, "--base-url", help="Optional base URL"),
) -> None:
    """Create a provider profile."""
    from openharness.auth.manager import AuthManager
    from openharness.config.settings import ProviderProfile

    manager = AuthManager()
    manager.upsert_profile(
        name,
        ProviderProfile(
            label=label,
            provider=provider,
            api_format=api_format,
            auth_source=auth_source,
            default_model=model,
            last_model=model,
            base_url=base_url,
        ),
    )
    print(f"Saved provider profile: {name}", flush=True)


@provider_app.command("edit")
def provider_edit(
    name: str = typer.Argument(..., help="Provider profile name"),
    label: str | None = typer.Option(None, "--label", help="Display label"),
    provider: str | None = typer.Option(None, "--provider", help="Runtime provider id"),
    api_format: str | None = typer.Option(None, "--api-format", help="API format"),
    auth_source: str | None = typer.Option(None, "--auth-source", help="Auth source name"),
    model: str | None = typer.Option(None, "--model", help="Default model"),
    base_url: str | None = typer.Option(None, "--base-url", help="Optional base URL"),
) -> None:
    """Edit a provider profile."""
    from openharness.auth.manager import AuthManager

    manager = AuthManager()
    try:
        manager.update_profile(
            name,
            label=label,
            provider=provider,
            api_format=api_format,
            auth_source=auth_source,
            default_model=model,
            last_model=model,
            base_url=base_url,
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise typer.Exit(1)
    print(f"Updated provider profile: {name}", flush=True)


@provider_app.command("remove")
def provider_remove(
    name: str = typer.Argument(..., help="Provider profile name"),
) -> None:
    """Remove a provider profile."""
    from openharness.auth.manager import AuthManager

    manager = AuthManager()
    try:
        manager.remove_profile(name)
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise typer.Exit(1)
    print(f"Removed provider profile: {name}", flush=True)

# ---------------------------------------------------------------------------
# Main command
# ---------------------------------------------------------------------------

@app.callback(invoke_without_command=True)
def main(
    ctx: typer.Context,
    version: bool = typer.Option(
        False,
        "--version",
        "-v",
        help="Show version and exit",
        callback=_version_callback,
        is_eager=True,
    ),
    # --- Session ---
    continue_session: bool = typer.Option(
        False,
        "--continue",
        "-c",
        help="Continue the most recent conversation in the current directory",
        rich_help_panel="Session",
    ),
    resume: str | None = typer.Option(
        None,
        "--resume",
        "-r",
        help="Resume a conversation by session ID, or open picker",
        rich_help_panel="Session",
    ),
    name: str | None = typer.Option(
        None,
        "--name",
        "-n",
        help="Set a display name for this session",
        rich_help_panel="Session",
    ),
    # --- Model & Effort ---
    model: str | None = typer.Option(
        None,
        "--model",
        "-m",
        help="Model alias (e.g. 'sonnet', 'opus') or full model ID",
        rich_help_panel="Model & Effort",
    ),
    effort: str | None = typer.Option(
        None,
        "--effort",
        help="Effort level for the session (low, medium, high, max)",
        rich_help_panel="Model & Effort",
    ),
    verbose: bool = typer.Option(
        False,
        "--verbose",
        help="Override verbose mode setting from config",
        rich_help_panel="Model & Effort",
    ),
    max_turns: int | None = typer.Option(
        None,
        "--max-turns",
        help="Maximum number of agentic turns (enforced by default in --print; optional cap for interactive mode)",
        rich_help_panel="Model & Effort",
    ),
    # --- Output ---
    print_mode: str | None = typer.Option(
        None,
        "--print",
        "-p",
        help="Print response and exit. Pass your prompt as the value: -p 'your prompt'",
        rich_help_panel="Output",
    ),
    output_format: str | None = typer.Option(
        None,
        "--output-format",
        help="Output format with --print: text (default), json, or stream-json",
        rich_help_panel="Output",
    ),
    # --- Permissions ---
    permission_mode: str | None = typer.Option(
        None,
        "--permission-mode",
        help="Permission mode: default, plan, or full_auto",
        rich_help_panel="Permissions",
    ),
    dangerously_skip_permissions: bool = typer.Option(
        False,
        "--dangerously-skip-permissions",
        help="Bypass all permission checks (only for sandboxed environments)",
        rich_help_panel="Permissions",
    ),
    allowed_tools: Optional[list[str]] = typer.Option(
        None,
        "--allowed-tools",
        help="Comma or space-separated list of tool names to allow",
        rich_help_panel="Permissions",
    ),
    disallowed_tools: Optional[list[str]] = typer.Option(
        None,
        "--disallowed-tools",
        help="Comma or space-separated list of tool names to deny",
        rich_help_panel="Permissions",
    ),
    # --- System & Context ---
    system_prompt: str | None = typer.Option(
        None,
        "--system-prompt",
        "-s",
        help="Override the default system prompt",
        rich_help_panel="System & Context",
    ),
    append_system_prompt: str | None = typer.Option(
        None,
        "--append-system-prompt",
        help="Append text to the default system prompt",
        rich_help_panel="System & Context",
    ),
    settings_file: str | None = typer.Option(
        None,
        "--settings",
        help="Path to a JSON settings file or inline JSON string",
        rich_help_panel="System & Context",
    ),
    base_url: str | None = typer.Option(
        None,
        "--base-url",
        help="Anthropic-compatible API base URL",
        rich_help_panel="System & Context",
    ),
    api_key: str | None = typer.Option(
        None,
        "--api-key",
        "-k",
        help="API key (overrides config and environment)",
        rich_help_panel="System & Context",
    ),
    bare: bool = typer.Option(
        False,
        "--bare",
        help="Minimal mode: skip hooks, plugins, MCP, and auto-discovery",
        rich_help_panel="System & Context",
    ),
    api_format: str | None = typer.Option(
        None,
        "--api-format",
        help="API format: 'anthropic' (default), 'openai' (DashScope, GitHub Models, etc.), or 'copilot' (GitHub Copilot)",
        rich_help_panel="System & Context",
    ),
    theme: str | None = typer.Option(
        None,
        "--theme",
        help="TUI theme: default, dark, minimal, cyberpunk, solarized, or custom name",
        rich_help_panel="System & Context",
    ),
    # --- Advanced ---
    debug: bool = typer.Option(
        False,
        "--debug",
        "-d",
        help="Enable debug logging",
        rich_help_panel="Advanced",
    ),
    mcp_config: Optional[list[str]] = typer.Option(
        None,
        "--mcp-config",
        help="Load MCP servers from JSON files or strings",
        rich_help_panel="Advanced",
    ),
    cwd: str = typer.Option(
        str(Path.cwd()),
        "--cwd",
        help="Working directory for the session",
        hidden=True,
    ),
    backend_only: bool = typer.Option(
        False,
        "--backend-only",
        help="Run the structured backend host for the React terminal UI",
        hidden=True,
    ),
) -> None:
    """Start an interactive session or run a single prompt."""
    if ctx.invoked_subcommand is not None:
        return

    import asyncio

    if dangerously_skip_permissions:
        permission_mode = "full_auto"

    # Apply --theme override to settings
    if theme:
        from openharness.config.settings import load_settings, save_settings

        settings = load_settings()
        settings.theme = theme
        save_settings(settings)

    from openharness.ui.app import run_print_mode, run_repl

    # Handle --continue and --resume flags
    if continue_session or resume is not None:
        from openharness.services.session_storage import (
            list_session_snapshots,
            load_session_by_id,
            load_session_snapshot,
        )

        session_data = None
        if continue_session:
            session_data = load_session_snapshot(cwd)
            if session_data is None:
                print("No previous session found in this directory.", file=sys.stderr)
                raise typer.Exit(1)
            print(f"Continuing session: {session_data.get('summary', '(untitled)')[:60]}")
        elif resume == "" or resume is None:
            # --resume with no value: show session picker
            sessions = list_session_snapshots(cwd, limit=10)
            if not sessions:
                print("No saved sessions found.", file=sys.stderr)
                raise typer.Exit(1)
            print("Saved sessions:")
            for i, s in enumerate(sessions, 1):
                print(f"  {i}. [{s['session_id']}] {s.get('summary', '?')[:50]} ({s['message_count']} msgs)")
            choice = typer.prompt("Enter session number or ID")
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(sessions):
                    session_data = load_session_by_id(cwd, sessions[idx]["session_id"])
                else:
                    print("Invalid selection.", file=sys.stderr)
                    raise typer.Exit(1)
            except ValueError:
                session_data = load_session_by_id(cwd, choice)
            if session_data is None:
                print(f"Session not found: {choice}", file=sys.stderr)
                raise typer.Exit(1)
        else:
            session_data = load_session_by_id(cwd, resume)
            if session_data is None:
                print(f"Session not found: {resume}", file=sys.stderr)
                raise typer.Exit(1)

        # Pass restored session to the REPL
        asyncio.run(
            run_repl(
                prompt=None,
                cwd=cwd,
                model=session_data.get("model") or model,
                backend_only=backend_only,
                base_url=base_url,
                system_prompt=session_data.get("system_prompt") or system_prompt,
                api_key=api_key,
                restore_messages=session_data.get("messages"),
            )
        )
        return

    if print_mode is not None:
        prompt = print_mode.strip()
        if not prompt:
            print("Error: -p/--print requires a prompt value, e.g. -p 'your prompt'", file=sys.stderr)
            raise typer.Exit(1)
        asyncio.run(
            run_print_mode(
                prompt=prompt,
                output_format=output_format or "text",
                cwd=cwd,
                model=model,
                base_url=base_url,
                system_prompt=system_prompt,
                append_system_prompt=append_system_prompt,
                api_key=api_key,
                api_format=api_format,
                permission_mode=permission_mode,
                max_turns=max_turns,
            )
        )
        return

    asyncio.run(
        run_repl(
            prompt=None,
            cwd=cwd,
            model=model,
            max_turns=max_turns,
            backend_only=backend_only,
            base_url=base_url,
            system_prompt=system_prompt,
            api_key=api_key,
            api_format=api_format,
        )
    )
