import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { apiErrorMessage } from '../../core/api';
import { Session } from '../../core/session';

@Component({
  selector: 'ers-login',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  /** ?expirada=1 cuando el interceptor cerro la sesion (llega por withComponentInputBinding). */
  readonly expirada = input<string>();

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected readonly sending = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    if (this.expirada()) this.error.set('Tu sesión expiró. Vuelve a ingresar.');
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.sending.set(true);
    this.error.set('');
    try {
      const { email, password } = this.form.getRawValue();
      await this.session.login(email.trim(), password);
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'No se pudo iniciar sesión.'));
    } finally {
      this.sending.set(false);
    }
  }

  protected invalid(name: 'email' | 'password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }
}
