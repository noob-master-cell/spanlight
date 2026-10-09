import { useNavigate } from "@tanstack/react-router";
import { FolderOpen, KeyRound, LogOut, Monitor, Moon, Search, Sun, Users } from "lucide-react";
import { useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { useTheme } from "@/lib/theme";

import { NAV_ITEMS } from "./nav-items";
import { useOrgProjectsQuery, useProjectParams } from "./project-context";
import { useSignOut } from "./use-sign-out";

const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const params = useProjectParams();
  const projectsQuery = useOrgProjectsQuery(params.orgId);
  const { setTheme } = useTheme();
  const signOut = useSignOut();
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();

  function run(action: () => void) {
    onOpenChange(false);
    setQuery("");
    action();
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
        }
      }}
      title="Command palette"
      description="Search for pages, projects and actions"
    >
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Type a command, page, or trace ID…"
      />
      <CommandList>
        <CommandEmpty>No matching commands.</CommandEmpty>

        {TRACE_ID_PATTERN.test(trimmed) ? (
          <CommandGroup heading="Trace">
            <CommandItem
              value={`open trace ${trimmed}`}
              onSelect={() => {
                run(() => {
                  void navigate({
                    to: "/$orgId/$projectId/traces/$traceId",
                    params: { ...params, traceId: trimmed },
                  });
                });
              }}
            >
              <Search aria-hidden />
              Open trace <span className="font-mono text-xs">{trimmed}</span>
            </CommandItem>
          </CommandGroup>
        ) : null}

        <CommandGroup heading="Go to">
          {NAV_ITEMS.map(({ label, to, icon: Icon, shortcut }) => (
            <CommandItem
              key={to}
              value={`go to ${label}`}
              onSelect={() => {
                run(() => {
                  void navigate({ to, params });
                });
              }}
            >
              <Icon aria-hidden />
              <span className="flex-1">{label}</span>
              <span className="flex gap-1" aria-hidden>
                {shortcut.split(" ").map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </span>
            </CommandItem>
          ))}
          <CommandItem
            value="go to api keys"
            onSelect={() => {
              run(() => {
                void navigate({ to: "/$orgId/$projectId/settings/keys", params });
              });
            }}
          >
            <KeyRound aria-hidden />
            API keys
          </CommandItem>
          <CommandItem
            value="go to members"
            onSelect={() => {
              run(() => {
                void navigate({ to: "/$orgId/$projectId/settings/members", params });
              });
            }}
          >
            <Users aria-hidden />
            Members
          </CommandItem>
        </CommandGroup>

        {projectsQuery.data && projectsQuery.data.length > 1 ? (
          <CommandGroup heading="Switch project">
            {projectsQuery.data
              .filter((project) => project.id !== params.projectId)
              .map((project) => (
                <CommandItem
                  key={project.id}
                  value={`switch project ${project.name}`}
                  onSelect={() => {
                    run(() => {
                      void navigate({
                        to: "/$orgId/$projectId/overview",
                        params: { orgId: params.orgId, projectId: project.id },
                      });
                    });
                  }}
                >
                  <FolderOpen aria-hidden />
                  {project.name}
                </CommandItem>
              ))}
          </CommandGroup>
        ) : null}

        <CommandSeparator />

        <CommandGroup heading="Preferences">
          <CommandItem
            value="theme light"
            onSelect={() => {
              run(() => {
                setTheme("light");
              });
            }}
          >
            <Sun aria-hidden />
            Use light theme
          </CommandItem>
          <CommandItem
            value="theme dark"
            onSelect={() => {
              run(() => {
                setTheme("dark");
              });
            }}
          >
            <Moon aria-hidden />
            Use dark theme
          </CommandItem>
          <CommandItem
            value="theme system"
            onSelect={() => {
              run(() => {
                setTheme("system");
              });
            }}
          >
            <Monitor aria-hidden />
            Match system theme
          </CommandItem>
          <CommandItem
            value="sign out log out"
            onSelect={() => {
              run(() => {
                signOut.mutate();
              });
            }}
          >
            <LogOut aria-hidden />
            Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
