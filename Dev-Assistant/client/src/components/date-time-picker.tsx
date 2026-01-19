import { useState, useEffect } from "react";
import { format, setHours, setMinutes } from "date-fns";
import { Calendar as CalendarIcon, Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DateTimePickerProps {
  value?: Date | null;
  onChange: (date: Date | null) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

const TIME_OPTIONS = [
  { hour: 6, minute: 0, label: "6:00 AM" },
  { hour: 6, minute: 30, label: "6:30 AM" },
  { hour: 7, minute: 0, label: "7:00 AM" },
  { hour: 7, minute: 30, label: "7:30 AM" },
  { hour: 8, minute: 0, label: "8:00 AM" },
  { hour: 8, minute: 30, label: "8:30 AM" },
  { hour: 9, minute: 0, label: "9:00 AM" },
  { hour: 9, minute: 30, label: "9:30 AM" },
  { hour: 10, minute: 0, label: "10:00 AM" },
  { hour: 10, minute: 30, label: "10:30 AM" },
  { hour: 11, minute: 0, label: "11:00 AM" },
  { hour: 11, minute: 30, label: "11:30 AM" },
  { hour: 12, minute: 0, label: "12:00 PM" },
  { hour: 12, minute: 30, label: "12:30 PM" },
  { hour: 13, minute: 0, label: "1:00 PM" },
  { hour: 13, minute: 30, label: "1:30 PM" },
  { hour: 14, minute: 0, label: "2:00 PM" },
  { hour: 14, minute: 30, label: "2:30 PM" },
  { hour: 15, minute: 0, label: "3:00 PM" },
  { hour: 15, minute: 30, label: "3:30 PM" },
  { hour: 16, minute: 0, label: "4:00 PM" },
  { hour: 16, minute: 30, label: "4:30 PM" },
  { hour: 17, minute: 0, label: "5:00 PM" },
  { hour: 17, minute: 30, label: "5:30 PM" },
  { hour: 18, minute: 0, label: "6:00 PM" },
  { hour: 18, minute: 30, label: "6:30 PM" },
  { hour: 19, minute: 0, label: "7:00 PM" },
  { hour: 19, minute: 30, label: "7:30 PM" },
  { hour: 20, minute: 0, label: "8:00 PM" },
  { hour: 20, minute: 30, label: "8:30 PM" },
  { hour: 21, minute: 0, label: "9:00 PM" },
  { hour: 21, minute: 30, label: "9:30 PM" },
  { hour: 22, minute: 0, label: "10:00 PM" },
];

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Select date & time",
  className,
  "data-testid": testId,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(value ?? undefined);
  const [selectedTime, setSelectedTime] = useState<{ hour: number; minute: number } | null>(
    value ? { hour: value.getHours(), minute: value.getMinutes() } : null
  );
  const [step, setStep] = useState<"date" | "time">("date");

  useEffect(() => {
    if (value) {
      setSelectedDate(value);
      setSelectedTime({ hour: value.getHours(), minute: value.getMinutes() });
    } else {
      setSelectedDate(undefined);
      setSelectedTime(null);
    }
  }, [value]);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setSelectedDate(date);
      setStep("time");
    }
  };

  const handleTimeSelect = (hour: number, minute: number) => {
    setSelectedTime({ hour, minute });
    
    if (selectedDate) {
      const finalDate = setMinutes(setHours(selectedDate, hour), minute);
      onChange(finalDate);
      setOpen(false);
      setStep("date");
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
    setSelectedDate(undefined);
    setSelectedTime(null);
    setStep("date");
  };

  const displayValue = value
    ? format(value, "MMM d, yyyy 'at' h:mm a")
    : null;

  return (
    <Popover open={open} onOpenChange={(isOpen) => {
      setOpen(isOpen);
      if (!isOpen) {
        setStep("date");
      }
    }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
          data-testid={testId}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayValue || placeholder}
          {value && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span 
                  className="ml-auto p-0.5 rounded-sm hover:bg-muted cursor-pointer"
                  onClick={handleClear}
                >
                  <X className="h-4 w-4 opacity-50 hover:opacity-100" />
                </span>
              </TooltipTrigger>
              <TooltipContent>Clear date</TooltipContent>
            </Tooltip>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {step === "date" ? (
          <div className="p-2">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              initialFocus
              disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
            />
            <div className="border-t p-3 space-y-2">
              <p className="text-xs text-muted-foreground text-center">
                Select a date, then choose a time
              </p>
            </div>
          </div>
        ) : (
          <div className="p-2">
            <div className="flex items-center gap-2 pb-2 border-b mb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep("date")}
                className="text-xs"
              >
                <CalendarIcon className="h-3 w-3 mr-1" />
                {selectedDate && format(selectedDate, "MMM d")}
              </Button>
              <span className="text-muted-foreground text-sm">Select time</span>
            </div>
            <ScrollArea className="h-[280px]">
              <div className="grid grid-cols-2 gap-1 p-1">
                {TIME_OPTIONS.map((time) => (
                  <Button
                    key={`${time.hour}-${time.minute}`}
                    variant={
                      selectedTime?.hour === time.hour && selectedTime?.minute === time.minute
                        ? "default"
                        : "ghost"
                    }
                    size="sm"
                    className="justify-start"
                    onClick={() => handleTimeSelect(time.hour, time.minute)}
                    data-testid={`button-time-${time.hour}-${time.minute}`}
                  >
                    <Clock className="h-3 w-3 mr-2" />
                    {time.label}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
