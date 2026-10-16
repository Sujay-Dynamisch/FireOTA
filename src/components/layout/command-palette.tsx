import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { q } from "@/lib/queries";

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const apps = useQuery({ ...q.apps(), enabled: open });
  const releases = useQuery({ ...q.releases(), enabled: open });
  const channels = useQuery({ ...q.channels(), enabled: open });
  const projects = useQuery({ ...q.projects(), enabled: open });
  const team = useQuery({ ...q.team(), enabled: open });
  const audit = useQuery({ ...q.audit(), enabled: open });
  const agents = useQuery({ ...q.agents(), enabled: open });

  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to: to as never });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search apps, releases, channels, commands…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No matches.</CommandEmpty>

        <CommandGroup heading="Commands">
          <CommandItem onSelect={() => go("/apps/new")}>Add application</CommandItem>
          <CommandItem onSelect={() => go(apps.data?.[0] ? `/apps/${apps.data[0].id}/releases/new` : "/apps/new")}>
            Create release
          </CommandItem>
          <CommandItem onSelect={() => go("/projects/connect")}>Connect Firebase</CommandItem>
          <CommandItem onSelect={() => go("/rollouts")}>Manage rollouts</CommandItem>
          <CommandItem onSelect={() => go("/analytics")}>Open analytics</CommandItem>
          <CommandItem onSelect={() => go("/team")}>Invite team member</CommandItem>
          <CommandItem onSelect={() => go("/settings")}>Open settings</CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Applications">
          {(apps.data ?? []).map((app) => (
            <CommandItem key={app.id} value={`app ${app.name}`} onSelect={() => go(`/apps/${app.id}`)}>
              {app.name}
              <span className="ml-auto font-mono text-[10px] text-faint">{app.currentRelease}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Releases">
          {(releases.data ?? []).map((release) => (
            <CommandItem
              key={release.id}
              value={`release ${release.number} ${release.version} ${release.appName}`}
              onSelect={() => go(`/releases/${release.id}`)}
            >
              #{release.number} · {release.shortId ?? release.id.slice(0, 8)}{release.version ? ` · ${release.version}` : ""}
              <span className="ml-auto font-mono text-[10px] text-faint">{release.appName}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Channels">
          {(channels.data ?? []).map((channel) => (
            <CommandItem
              key={channel.id}
              value={`channel ${channel.name} ${channel.appName}`}
              onSelect={() => go(`/channels/${channel.id}`)}
            >
              {channel.appName} · {channel.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Firebase projects">
          {(projects.data ?? []).map((project) => (
            <CommandItem
              key={project.id}
              value={`project ${project.name} ${project.firebaseId}`}
              onSelect={() => go(`/projects/${project.id}`)}
            >
              {project.name}
              <span className="ml-auto font-mono text-[10px] text-faint">{project.firebaseId}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Team">
          {(team.data ?? []).map((member) => (
            <CommandItem key={member.id} value={`member ${member.name} ${member.email}`} onSelect={() => go("/team")}>
              {member.name}
              <span className="ml-auto font-mono text-[10px] text-faint">{member.email}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Agents">
          {(agents.data ?? []).map((agent) => (
            <CommandItem key={agent.id} value={`agent ${agent.name}`} onSelect={() => go(`/agents/${agent.id}`)}>
              {agent.name}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandGroup heading="Audit events">
          {(audit.data ?? []).slice(0, 5).map((event) => (
            <CommandItem key={event.id} value={`audit ${event.action} ${event.actor}`} onSelect={() => go("/audit-logs")}>
              {event.action}
              <span className="ml-auto font-mono text-[10px] text-faint">{event.actor}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

/** Registers the CMD/CTRL+K shortcut and owns palette open state. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
