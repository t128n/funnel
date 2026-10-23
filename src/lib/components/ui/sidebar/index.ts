import Content from "./sidebar-content.svelte";
import Footer from "./sidebar-footer.svelte";
import GroupContent from "./sidebar-group-content.svelte";
import Group from "./sidebar-group.svelte";
import Header from "./sidebar-header.svelte";
import Inset from "./sidebar-inset.svelte";
import MenuBadge from "./sidebar-menu-badge.svelte";
import MenuButton from "./sidebar-menu-button.svelte";
import MenuItem from "./sidebar-menu-item.svelte";
import Menu from "./sidebar-menu.svelte";
import Provider from "./sidebar-provider.svelte";
import Rail from "./sidebar-rail.svelte";
import Trigger from "./sidebar-trigger.svelte";
import Root from "./sidebar.svelte";
import { useSidebar } from "./context.svelte.js";

export {
	Content,
	Footer,
	Group,
	GroupContent,
	Header,
	Inset,
	Menu,
	MenuBadge,
	MenuButton,
	MenuItem,
	Provider,
	Rail,
	Root,
	Trigger,
	//
	Root as Sidebar,
	Content as SidebarContent,
	Footer as SidebarFooter,
	Group as SidebarGroup,
	GroupContent as SidebarGroupContent,
	Header as SidebarHeader,
	Inset as SidebarInset,
	Menu as SidebarMenu,
	MenuBadge as SidebarMenuBadge,
	MenuButton as SidebarMenuButton,
	MenuItem as SidebarMenuItem,
	Provider as SidebarProvider,
	Rail as SidebarRail,
	Trigger as SidebarTrigger,
	useSidebar,
};
