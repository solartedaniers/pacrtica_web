import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RuntimeEnvironmentService } from '../../services/runtime-environment.service';

@Component({
  selector: 'app-isolation-error',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './isolation-error.component.html',
})
export class IsolationErrorComponent {
  protected readonly environment = inject(RuntimeEnvironmentService);
}
