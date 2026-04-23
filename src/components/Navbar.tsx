import { useState, useEffect, memo } from "react";
import { Menu, X } from "lucide-react";
import cybershieldLogo from "@/assets/logo-cybshield-new.webp";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "Recursos", href: "#recursos" },
  { label: "Preços", href: "#precos" },
  { label: "Tutoriais", href: "/tutorials", isRoute: true },
  { label: "FAQ", href: "#faq" },
  { label: "Contato", href: "#contato" },
];

export const Navbar = memo(() => {
  const [mobileOpen, setMobileOpen] = useState(false);
// ... keep existing code
  );
});

Navbar.displayName = 'Navbar';
