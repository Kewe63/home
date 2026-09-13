"use client";

import { ChartNoAxesCombined, House } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  isHomeNestedPanelId,
  navigationItems,
  type NavigationId,
  type ShellPanelId,
} from "@/config/navigation";

 type PrimaryNavigationProps = {
  activeNavigation: ShellPanelId;
  onNavigate: (id: NavigationId) => void;
};

const navigationIcons = {
  home: House,
  invest: ChartNoAxesCombined,
} satisfies Record<NavigationId, typeof House>;

export function PrimaryNavigation({
  activeNavigation,
  onNavigate,
}: PrimaryNavigationProps) {
  return (
    <nav
      className="order-2 grid shrink-0 grid-cols-2 border-t bg-background pb-[env(safe-area-inset-bottom)] md:order-1 md:border-y md:pb-0"
      aria-label="Main navigation"
    >
      {navigationItems.map((item) => {
        const Icon = navigationIcons[item.id];
        const isActive =
          activeNavigation === item.id ||
          (item.id === "home" && isHomeNestedPanelId(activeNavigation));

        return (
          <Button
            key={item.id}
            id={`${item.id}-nav`}
            variant="ghost"
            size="lg"
            className="h-12 min-w-0 rounded-none text-muted-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground"
            onClick={() => onNavigate(item.id)}
            aria-current={isActive ? "page" : undefined}
            aria-controls="navigation-panel"
          >
            <Icon className="size-5" aria-hidden="true" />
            <span className="truncate">{item.label}</span>
          </Button>
        );
      })}
    </nav>
  );
}
