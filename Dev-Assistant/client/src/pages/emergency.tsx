import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Phone, 
  Plus, 
  AlertTriangle,
  User,
  Trash2,
  Edit2,
  FileText
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useUser } from "@/lib/user-context";
import { PageTransition, StaggeredList } from "@/components/juice";

interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  notes?: string | null;
  priority: number;
}

interface EmergencyProtocol {
  id: string;
  title: string;
  description: string;
  steps: string[];
  contactIds: string[];
}

function EmergencySkeleton() {
  return (
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-10 w-full" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-24" />
      ))}
    </div>
  );
}

export default function Emergency() {
  const { toast } = useToast();
  const { activeRole } = useUser();
  const isAssistant = activeRole === "ASSISTANT";
  const [showContactDialog, setShowContactDialog] = useState(false);
  const [showProtocolDialog, setShowProtocolDialog] = useState(false);
  const [editingContact, setEditingContact] = useState<EmergencyContact | null>(null);
  const [newContact, setNewContact] = useState({
    name: "",
    phone: "",
    relationship: "",
    notes: "",
    priority: 1,
  });
  const [newProtocol, setNewProtocol] = useState({
    title: "",
    description: "",
    steps: [""],
    contactIds: [] as string[],
  });

  const { data: contacts, isLoading: contactsLoading } = useQuery<EmergencyContact[]>({
    queryKey: ["/api/emergency/contacts"],
  });

  const { data: protocols, isLoading: protocolsLoading } = useQuery<EmergencyProtocol[]>({
    queryKey: ["/api/emergency/protocols"],
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: typeof newContact) => {
      return apiRequest("POST", "/api/emergency/contacts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emergency/contacts"] });
      setShowContactDialog(false);
      setNewContact({ name: "", phone: "", relationship: "", notes: "", priority: 1 });
      toast({ title: "Contact added", description: "Emergency contact has been saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add contact", variant: "destructive" });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof newContact }) => {
      return apiRequest("PATCH", `/api/emergency/contacts/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emergency/contacts"] });
      setShowContactDialog(false);
      setEditingContact(null);
      toast({ title: "Contact updated" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/emergency/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emergency/contacts"] });
      toast({ title: "Contact deleted" });
    },
  });

  const createProtocolMutation = useMutation({
    mutationFn: async (data: typeof newProtocol) => {
      return apiRequest("POST", "/api/emergency/protocols", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emergency/protocols"] });
      setShowProtocolDialog(false);
      setNewProtocol({ title: "", description: "", steps: [""], contactIds: [] });
      toast({ title: "Protocol created" });
    },
  });

  const handleEditContact = (contact: EmergencyContact) => {
    setEditingContact(contact);
    setNewContact({
      name: contact.name,
      phone: contact.phone,
      relationship: contact.relationship,
      notes: contact.notes || "",
      priority: contact.priority,
    });
    setShowContactDialog(true);
  };

  const handleSaveContact = () => {
    if (editingContact) {
      updateContactMutation.mutate({ id: editingContact.id, data: newContact });
    } else {
      createContactMutation.mutate(newContact);
    }
  };

  const addProtocolStep = () => {
    setNewProtocol((prev) => ({ ...prev, steps: [...prev.steps, ""] }));
  };

  const updateProtocolStep = (index: number, value: string) => {
    setNewProtocol((prev) => ({
      ...prev,
      steps: prev.steps.map((s, i) => (i === index ? value : s)),
    }));
  };

  if (contactsLoading || protocolsLoading) return <EmergencySkeleton />;

  const sortedContacts = [...(contacts || [])].sort((a, b) => a.priority - b.priority);

  return (
    <PageTransition>
    <div className="px-4 py-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 animate-fade-in-up">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Emergency</h1>
      </div>

      <Tabs defaultValue="contacts">
        <TabsList className="w-full">
          <TabsTrigger value="contacts" className="flex-1" data-testid="tab-contacts">
            <Phone className="h-4 w-4 mr-2" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="protocols" className="flex-1" data-testid="tab-protocols">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Protocols
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="space-y-4 mt-4">
          {isAssistant && (
            <div className="flex justify-end">
              <Button 
                size="sm" 
                onClick={() => {
                  setEditingContact(null);
                  setNewContact({ name: "", phone: "", relationship: "", notes: "", priority: 1 });
                  setShowContactDialog(true);
                }}
                data-testid="button-add-contact"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Contact
              </Button>
            </div>
          )}

          {sortedContacts.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <Phone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No emergency contacts yet</p>
                <p className="text-sm text-muted-foreground">Add important contacts for quick access</p>
              </CardContent>
            </Card>
          ) : (
            <StaggeredList className="space-y-3">
              {sortedContacts.map((contact) => (
                <Card key={contact.id} data-testid={`card-contact-${contact.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{contact.name}</p>
                            <Badge variant="secondary" className="text-xs">
                              Priority {contact.priority}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{contact.relationship}</p>
                          <a 
                            href={`tel:${contact.phone}`} 
                            className="text-sm text-primary hover:underline"
                            data-testid={`link-phone-${contact.id}`}
                          >
                            {contact.phone}
                          </a>
                          {contact.notes && (
                            <p className="text-sm text-muted-foreground mt-1">{contact.notes}</p>
                          )}
                        </div>
                      </div>
                      {isAssistant && (
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleEditContact(contact)}
                            data-testid={`button-edit-${contact.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => deleteContactMutation.mutate(contact.id)}
                            data-testid={`button-delete-${contact.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </StaggeredList>
          )}
        </TabsContent>

        <TabsContent value="protocols" className="space-y-4 mt-4">
          {isAssistant && (
            <div className="flex justify-end">
              <Button 
                size="sm" 
                onClick={() => setShowProtocolDialog(true)}
                data-testid="button-add-protocol"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Protocol
              </Button>
            </div>
          )}

          {(!protocols || protocols.length === 0) ? (
            <Card>
              <CardContent className="py-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No emergency protocols yet</p>
                <p className="text-sm text-muted-foreground">Create step-by-step guides for emergencies</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {protocols.map((protocol) => (
                <Card key={protocol.id} data-testid={`card-protocol-${protocol.id}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      {protocol.title}
                    </CardTitle>
                    <CardDescription>{protocol.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ol className="list-decimal list-inside space-y-1 text-sm">
                      {protocol.steps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={showContactDialog} onOpenChange={setShowContactDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingContact ? "Edit Contact" : "Add Emergency Contact"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={newContact.name}
                onChange={(e) => setNewContact((p) => ({ ...p, name: e.target.value }))}
                placeholder="Contact name"
                data-testid="input-contact-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={newContact.phone}
                onChange={(e) => setNewContact((p) => ({ ...p, phone: e.target.value }))}
                placeholder="Phone number"
                type="tel"
                data-testid="input-contact-phone"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Relationship</label>
              <Input
                value={newContact.relationship}
                onChange={(e) => setNewContact((p) => ({ ...p, relationship: e.target.value }))}
                placeholder="e.g. Family Doctor, Plumber"
                data-testid="input-contact-relationship"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Priority</label>
              <Select 
                value={String(newContact.priority)} 
                onValueChange={(v) => setNewContact((p) => ({ ...p, priority: parseInt(v) }))}
              >
                <SelectTrigger data-testid="select-contact-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - Highest</SelectItem>
                  <SelectItem value="2">2 - High</SelectItem>
                  <SelectItem value="3">3 - Medium</SelectItem>
                  <SelectItem value="4">4 - Low</SelectItem>
                  <SelectItem value="5">5 - Lowest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Notes (optional)</label>
              <Textarea
                value={newContact.notes}
                onChange={(e) => setNewContact((p) => ({ ...p, notes: e.target.value }))}
                placeholder="Additional notes"
                data-testid="input-contact-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContactDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveContact}
              disabled={!newContact.name || !newContact.phone || createContactMutation.isPending || updateContactMutation.isPending}
              data-testid="button-save-contact"
            >
              {editingContact ? "Update" : "Add"} Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showProtocolDialog} onOpenChange={setShowProtocolDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Emergency Protocol</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newProtocol.title}
                onChange={(e) => setNewProtocol((p) => ({ ...p, title: e.target.value }))}
                placeholder="e.g. Fire Emergency"
                data-testid="input-protocol-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newProtocol.description}
                onChange={(e) => setNewProtocol((p) => ({ ...p, description: e.target.value }))}
                placeholder="Brief description of when to use this protocol"
                data-testid="input-protocol-description"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Steps</label>
              <div className="space-y-2">
                {newProtocol.steps.map((step, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="text-sm text-muted-foreground w-6">{idx + 1}.</span>
                    <Input
                      value={step}
                      onChange={(e) => updateProtocolStep(idx, e.target.value)}
                      placeholder={`Step ${idx + 1}`}
                      data-testid={`input-protocol-step-${idx}`}
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addProtocolStep} className="w-full">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProtocolDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => createProtocolMutation.mutate(newProtocol)}
              disabled={!newProtocol.title || createProtocolMutation.isPending}
              data-testid="button-save-protocol"
            >
              Create Protocol
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  );
}
