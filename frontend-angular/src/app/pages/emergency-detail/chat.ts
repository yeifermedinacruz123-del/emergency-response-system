import {
  AfterViewChecked,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { formatTime } from '../../core/format';
import { HookLog } from '../../core/hook-log';
import { ChatMessage } from '../../core/models';

const ROLE_LABEL: Record<string, string> = {
  ADMINISTRADOR: 'Centro de control',
  OPERADOR: 'Centro de control',
  PERSONAL: 'Unidad',
};

/**
 * Chat entre el centro de control y la unidad asignada.
 *
 * Hook: ngAfterViewChecked. Se ejecuta cuando Angular termina de pintar la
 * vista. Es el unico momento en que el mensaje nuevo ya existe en el DOM y se
 * puede bajar el scroll hasta el. Como el hook corre en CADA revision, solo se
 * mueve el scroll si de verdad cambio la cantidad de mensajes; si no, el
 * operador no podria subir a leer mensajes viejos.
 */
@Component({
  selector: 'ers-chat',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat.html',
  styleUrl: './chat.css',
})
export class Chat implements AfterViewChecked {
  private readonly hooks = inject(HookLog);

  @ViewChild('scroller') private scroller?: ElementRef<HTMLElement>;

  @Input({ required: true }) messages: ChatMessage[] = [];
  @Input() currentUserId: number | null = null;
  @Input() disabled = false;
  @Input() sending = false;
  @Output() readonly send = new EventEmitter<string>();

  protected draft = '';
  private renderedCount = 0;

  protected readonly formatTime = formatTime;
  protected readonly roleLabel = ROLE_LABEL;

  ngAfterViewChecked(): void {
    if (this.messages.length === this.renderedCount || !this.scroller) return;
    const element = this.scroller.nativeElement;
    element.scrollTop = element.scrollHeight;

    this.hooks.log(
      'Chat',
      'ngAfterViewChecked',
      this.messages.length > this.renderedCount
        ? `${this.messages.length - this.renderedCount} mensaje(s) pintado(s): scroll al final`
        : 'lista de mensajes cambió: scroll al final'
    );
    this.renderedCount = this.messages.length;
  }

  protected submit(): void {
    const text = this.draft.trim();
    if (!text || this.disabled) return;
    this.send.emit(text);
    this.draft = '';
  }
}
