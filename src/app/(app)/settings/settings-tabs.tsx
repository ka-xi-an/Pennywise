import { Tabs } from "@/components/ui/core";

export function SettingsTabs({ active }: { active: string }) {
  return (
    <Tabs
      active={active}
      items={[
        { id: "general", label: "Profile & preferences", href: "/settings" },
        { id: "security", label: "Security", href: "/settings/security" },
        { id: "data", label: "Data, import/export & backup", href: "/settings/data" },
      ]}
    />
  );
}
