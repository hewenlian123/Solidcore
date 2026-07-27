"use client";

import * as React from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type DrawerContentProps = React.ComponentProps<typeof SheetContent>;

const Drawer = Sheet;
const DrawerTrigger = SheetTrigger;
const DrawerClose = SheetClose;

export const DrawerContent = React.forwardRef<
  React.ElementRef<typeof SheetContent>,
  DrawerContentProps
>(({ side = "bottom", ...props }, ref) => <SheetContent ref={ref} side={side} {...props} />);
DrawerContent.displayName = "DrawerContent";

const DrawerHeader = SheetHeader;
const DrawerFooter = SheetFooter;
const DrawerTitle = SheetTitle;
const DrawerDescription = SheetDescription;

export {
  Drawer,
  DrawerTrigger,
  DrawerClose,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
